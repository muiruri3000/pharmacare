from decimal import Decimal
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
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
from .models import Customer, Sale, SaleItem, SalePayment, CashierShift
from .serializers import CustomerSerializer, SaleSerializer, CashierShiftSerializer


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
        qs = Sale.objects.select_related("customer", "sold_by", "prescription").prefetch_related("items__product", "payments")
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
        payments_data = serializer.validated_data.pop("payments", None)

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

        # Handle payments (split or single)
        if payments_data:
            sale.payment_method = Sale.SPLIT if len(payments_data) > 1 else payments_data[0]["payment_method"]
            sale.save(update_fields=["payment_method"])
            for p in payments_data:
                SalePayment.objects.create(sale=sale, **p)
        else:
            SalePayment.objects.create(
                sale=sale,
                payment_method=sale.payment_method,
                amount=sale.total,
            )

        # Handle prescription auto-completion if sale was linked to a pending prescription
        if sale.prescription and sale.prescription.status == "pending":
            sale.prescription.status = "dispensed"
            sale.prescription.dispensed_by = self.request.user
            sale.prescription.save(update_fields=["status", "dispensed_by"])
            sale.prescription.items.all().update(dispensed=True)

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


class CashierShiftViewSet(viewsets.ModelViewSet):
    serializer_class = CashierShiftSerializer
    permission_classes = [SalesPermission]
    pagination_class = DefaultPagination
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["cashier__username"]
    ordering_fields = ["opened_at", "closed_at"]

    def get_queryset(self):
        qs = CashierShift.objects.select_related("cashier")
        role = role_of(self.request.user)
        if role != ADMIN:
            qs = qs.filter(cashier=self.request.user)
        return qs

    @action(detail=False, methods=["get"])
    def current(self, request):
        """Returns the currently active open shift for the logged-in cashier."""
        shift = CashierShift.objects.filter(cashier=request.user, status=CashierShift.OPEN).first()
        if not shift:
            return Response(None, status=status.HTTP_200_OK)

        cash_sales = SalePayment.objects.filter(
            sale__sold_by=request.user,
            sale__status=Sale.COMPLETED,
            sale__created_at__gte=shift.opened_at,
            payment_method="cash",
        ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

        data = CashierShiftSerializer(shift).data
        data["current_cash_sales"] = cash_sales
        data["estimated_drawer_total"] = shift.opening_float + cash_sales
        return Response(data)

    @action(detail=False, methods=["post"])
    def open_shift(self, request):
        """Opens a new shift drawer with an initial cash float."""
        active = CashierShift.objects.filter(cashier=request.user, status=CashierShift.OPEN).first()
        if active:
            raise ValidationError("You already have an open shift. Please close it first.")

        opening_float = request.data.get("opening_float", 0)
        notes = request.data.get("notes", "")
        shift = CashierShift.objects.create(
            cashier=request.user,
            opening_float=opening_float,
            notes=notes,
            status=CashierShift.OPEN,
        )
        log_activity(request, "shift.opened", f"Cashier {request.user.username} opened shift #{shift.id} with float {opening_float}")
        return Response(CashierShiftSerializer(shift).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def close_shift(self, request, pk=None):
        """Closes an active shift drawer, reconciling cash collected."""
        shift = self.get_object()
        if shift.status == CashierShift.CLOSED:
            raise ValidationError("Shift is already closed.")

        closing_cash = Decimal(str(request.data.get("closing_cash", 0)))
        notes = request.data.get("notes", "")

        cash_sales = SalePayment.objects.filter(
            sale__sold_by=shift.cashier,
            sale__status=Sale.COMPLETED,
            sale__created_at__gte=shift.opened_at,
            payment_method="cash",
        ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

        expected = shift.opening_float + cash_sales
        diff = closing_cash - expected

        shift.status = CashierShift.CLOSED
        shift.closed_at = timezone.now()
        shift.closing_cash = closing_cash
        shift.expected_cash = expected
        shift.cash_difference = diff
        if notes:
            shift.notes = f"{shift.notes}\nClosing notes: {notes}".strip()
        shift.save()

        log_activity(
            request, "shift.closed",
            f"Cashier {shift.cashier.username} closed shift #{shift.id} (counted: {closing_cash}, expected: {expected}, diff: {diff})"
        )
        return Response(CashierShiftSerializer(shift).data)
