from django.db import transaction
from django.db.models import F, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.response import Response

from core.activity import log_activity
from core.permissions import InventoryPermission, IsAdmin
from core.pagination import DefaultPagination
from .models import Category, Product, Batch, StockMovement
from .serializers import CategorySerializer, ProductSerializer, BatchSerializer, StockMovementSerializer


class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    permission_classes = [InventoryPermission]
    pagination_class = DefaultPagination
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["name"]

    def get_queryset(self):
        return Category.objects.all()


class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    permission_classes = [InventoryPermission]
    pagination_class = DefaultPagination
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["name", "sku", "manufacturer", "barcode"]
    ordering_fields = ["name", "created_at", "reorder_level"]

    def get_queryset(self):
        # Annotated (not a Python-filtered list) so it stays a real
        # queryset — search/ordering/pagination all keep working even
        # when combined with ?low_stock=true. Explicit .order_by("name")
        # because annotate(Sum(...)) triggers a GROUP BY, which can
        # silently drop Product.Meta.ordering — leaving pagination
        # comparing an unordered queryset across pages (can show a row
        # twice or skip one).
        qs = Product.objects.select_related("category").annotate(
            _computed_qty=Coalesce(Sum("batches__quantity"), Value(0))
        ).order_by("name")
        low_stock = self.request.query_params.get("low_stock")
        if low_stock == "true":
            qs = qs.filter(_computed_qty__lte=F("reorder_level"))
        return qs

    def perform_create(self, serializer):
        product = serializer.save()
        log_activity(self.request, "product.created", f"Created product {product.name} ({product.sku})")

    def perform_destroy(self, instance):
        # Soft-delete only: a product may already be referenced by past
        # sales/purchase history, which must never disappear.
        instance.is_active = False
        instance.save(update_fields=["is_active"])
        log_activity(self.request, "product.deactivated", f"Deactivated product {instance.name}")

    @action(detail=False, methods=["get"])
    def expiring_soon(self, request):
        """Products with any batch expiring within `days` (default 30)."""
        days = int(request.query_params.get("days", 30))
        cutoff = timezone.now().date() + timezone.timedelta(days=days)
        batches = Batch.objects.filter(
            expiry_date__lte=cutoff, expiry_date__gte=timezone.now().date(), quantity__gt=0
        ).select_related("product")
        return Response(BatchSerializer(batches, many=True).data)

    @action(detail=False, methods=["get"])
    def lookup_barcode(self, request):
        """
        Exact-match barcode lookup for POS scanning. Deliberately a
        separate endpoint from the general `search` filter: search does
        a partial `icontains` match across name/sku/manufacturer/barcode,
        which for a scanner firing a 13-digit EAN could match the wrong
        product if that sequence happens to be a substring elsewhere.
        A scan needs one exact product or a clean "not found", not a
        ranked list.
        """
        code = request.query_params.get("code", "").strip()
        if not code:
            return Response({"detail": "Missing code."}, status=400)
        try:
            product = Product.objects.get(barcode=code, is_active=True)
        except Product.DoesNotExist:
            try:
                # Fall back to SKU — many pharmacies scan a printed SKU
                # label before a proper barcode catalogue exists.
                product = Product.objects.get(sku=code, is_active=True)
            except Product.DoesNotExist:
                return Response({"detail": "No matching product."}, status=404)
        return Response(ProductSerializer(product).data)


class BatchViewSet(viewsets.ModelViewSet):
    serializer_class = BatchSerializer
    permission_classes = [InventoryPermission]
    pagination_class = DefaultPagination
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["batch_number", "product__name"]
    ordering_fields = ["expiry_date", "received_date"]

    def get_queryset(self):
        qs = Batch.objects.select_related("product", "supplier").all()
        product_id = self.request.query_params.get("product")
        if product_id:
            qs = qs.filter(product_id=product_id)
        return qs

    @transaction.atomic
    def perform_create(self, serializer):
        batch = serializer.save()
        StockMovement.objects.create(
            product=batch.product,
            batch=batch,
            movement_type=StockMovement.IN,
            quantity=batch.quantity,
            reason="Batch received",
            reference=batch.batch_number,
            created_by=self.request.user,
        )
        log_activity(
            self.request, "batch.received",
            f"Received batch {batch.batch_number} of {batch.product.name} (qty {batch.quantity})",
        )


class StockMovementViewSet(viewsets.ModelViewSet):
    """
    Movements are normally created as a side effect of receiving a
    batch, ringing up a sale, or dispensing a prescription — this
    endpoint also allows a direct manual adjustment (stock count
    correction, breakage, write-off) and is always read-only history
    otherwise (no update/delete — it's an audit trail).
    """

    serializer_class = StockMovementSerializer
    permission_classes = [InventoryPermission]
    pagination_class = DefaultPagination
    http_method_names = ["get", "post", "head", "options"]
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["product__name", "reference", "reason"]
    ordering_fields = ["created_at"]

    def get_queryset(self):
        qs = StockMovement.objects.select_related("product", "created_by").all()
        product_id = self.request.query_params.get("product")
        if product_id:
            qs = qs.filter(product_id=product_id)
        return qs

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        """
        Actual stock is tracked on Batch.quantity, not on StockMovement
        rows — a movement with no batch attached would just be an inert
        audit-log entry. So a manual adjustment either targets a batch
        the caller picked, or (for a stock decrease with no batch given)
        draws down FEFO across whatever batches exist, recording one
        movement per batch touched. A positive adjustment with no batch
        is rejected — there's no batch to attach the new quantity/expiry
        to; use "Receive Batch" on the Batches page for genuinely new stock.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = serializer.validated_data["product"]
        quantity = serializer.validated_data["quantity"]
        batch = serializer.validated_data.get("batch")
        reason = serializer.validated_data.get("reason", "")
        reference = serializer.validated_data.get("reference", "")

        movements = []
        if batch is not None:
            batch.quantity = batch.quantity + quantity
            batch.save(update_fields=["quantity"])
            movements.append(
                StockMovement.objects.create(
                    product=product, batch=batch, movement_type=StockMovement.ADJUSTMENT,
                    quantity=quantity, reason=reason, reference=reference, created_by=request.user,
                )
            )
        elif quantity < 0:
            remaining = -quantity
            for b in Batch.objects.filter(product=product, quantity__gt=0).order_by("expiry_date"):
                if remaining <= 0:
                    break
                take = min(b.quantity, remaining)
                b.quantity -= take
                b.save(update_fields=["quantity"])
                movements.append(
                    StockMovement.objects.create(
                        product=product, batch=b, movement_type=StockMovement.ADJUSTMENT,
                        quantity=-take, reason=reason, reference=reference, created_by=request.user,
                    )
                )
                remaining -= take
            if remaining > 0:
                raise ValidationError(
                    f"Cannot remove {-quantity} of {product.name}: only "
                    f"{-quantity - remaining} available across all batches."
                )
        else:
            raise ValidationError(
                "Select a batch to add stock to, or use 'Receive Batch' on the "
                "Batches page to bring in new stock with its own expiry date."
            )

        return Response(StockMovementSerializer(movements, many=True).data, status=status.HTTP_201_CREATED)
