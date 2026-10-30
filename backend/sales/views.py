from django.db import transaction
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError

from core.activity import log_activity
from core.permissions import SalesPermission, ADMIN
from core.permissions import role_of
from core.pagination import DefaultPagination
from inventory.models import Batch, StockMovement
from .models import Customer, Sale, SaleItem
from .serializers import CustomerSerializer, SaleSerializer


class CustomerViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    permission_classes = [SalesPermission]
    pagination_class = DefaultPagination
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["name", "phone", "email"]

    def get_queryset(self):
        return Customer.objects.all()


class SaleViewSet(viewsets.ModelViewSet):
    """
    Creating a sale deducts stock FEFO (First-Expiry-First-Out): for
    each line item, the earliest-expiring batch with available quantity
    is drawn down first, recording a StockMovement per batch touched.
    Voiding a completed sale reverses those movements and restores
    quantity to the batches it was drawn from.
    """

    serializer_class = SaleSerializer
    permission_classes = [SalesPermission]
    pagination_class = DefaultPagination
    http_method_names = ["get", "post", "head", "options"]  # sales are immutable once rung up
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["customer__name", "id"]
    ordering_fields = ["created_at"]

    def get_queryset(self):
        qs = Sale.objects.select_related("customer", "sold_by").prefetch_related("items__product")
        role = role_of(self.request.user)
        if role != ADMIN:
            # Sales staff see the shop's full sales history (needed for
            # returns/lookups), not just their own — restrict further
            # here if your business wants per-cashier visibility only.
            pass
        return qs

    @transaction.atomic
    def perform_create(self, serializer):
        tenant = self.request.user.tenant
        price_field = "wholesale_price" if tenant and tenant.tenant_type == "wholesale" else "retail_price"
        items_data = serializer.validated_data.pop("items")

        sale = Sale.objects.create(
            sold_by=self.request.user,
            **{k: v for k, v in serializer.validated_data.items()},
        )

        for item_data in items_data:
            product = item_data["product"]
            quantity = item_data["quantity"]
            unit_price = item_data.get("unit_price")
            if unit_price is None:
                unit_price = getattr(product, price_field)

            remaining = quantity
            batches = Batch.objects.filter(product=product, quantity__gt=0).order_by("expiry_date")
            drawn_from = None
            for batch in batches:
                if remaining <= 0:
                    break
                take = min(batch.quantity, remaining)
                batch.quantity -= take
                batch.save(update_fields=["quantity"])
                StockMovement.objects.create(
                    product=product,
                    batch=batch,
                    movement_type=StockMovement.OUT,
                    quantity=-take,
                    reason="Sale",
                    reference=f"Sale-{sale.id}",
                    created_by=self.request.user,
                )
                if drawn_from is None:
                    drawn_from = batch
                remaining -= take

            if remaining > 0:
                raise ValidationError(
                    f"Insufficient stock for {product.name}: short by {remaining} {product.unit}(s)."
                )

            SaleItem.objects.create(
                sale=sale, product=product, batch=drawn_from, quantity=quantity, unit_price=unit_price
            )

        self._sale = sale

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        log_activity(request, "sale.created", f"Sale #{self._sale.id} — total {self._sale.total}")
        return Response(SaleSerializer(self._sale).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def void(self, request, pk=None):
        role = role_of(request.user)
        if role != ADMIN:
            return Response({"detail": "Only an admin can void a sale."}, status=403)
        sale = self.get_object()
        if sale.status == Sale.VOID:
            return Response({"detail": "Sale already void."}, status=400)

        # Reverse using the actual StockMovement records this sale
        # created, not SaleItem.batch — SaleItem only remembers the
        # *first* batch a line item was drawn from, but FEFO can split
        # a single item across several batches when the nearest-expiry
        # one didn't have enough quantity. Reversing from SaleItem.batch
        # would over-credit that first batch and never restore the
        # others that were actually touched.
        movements = StockMovement.objects.filter(
            reference=f"Sale-{sale.id}", movement_type=StockMovement.OUT
        )
        for movement in movements:
            if movement.batch_id:
                batch = movement.batch
                batch.quantity -= movement.quantity  # movement.quantity is negative, so this restores it
                batch.save(update_fields=["quantity"])
            StockMovement.objects.create(
                product=movement.product,
                batch=movement.batch,
                movement_type=StockMovement.IN,
                quantity=-movement.quantity,
                reason="Sale voided",
                reference=f"Sale-{sale.id}",
                created_by=request.user,
            )
        sale.status = Sale.VOID
        sale.save(update_fields=["status"])
        log_activity(request, "sale.voided", f"Voided Sale #{sale.id}")
        return Response(SaleSerializer(sale).data)
