from django.db import transaction
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.response import Response

from core.activity import log_activity
from core.permissions import PurchasingPermission
from core.pagination import DefaultPagination
from inventory.models import Batch, StockMovement
from .models import Supplier, PurchaseOrder
from .serializers import SupplierSerializer, PurchaseOrderSerializer


class SupplierViewSet(viewsets.ModelViewSet):
    serializer_class = SupplierSerializer
    permission_classes = [PurchasingPermission]
    pagination_class = DefaultPagination
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["name", "contact_person", "phone", "email"]

    def get_queryset(self):
        return Supplier.objects.all()


class PurchaseOrderViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseOrderSerializer
    permission_classes = [PurchasingPermission]
    pagination_class = DefaultPagination
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["supplier__name", "notes"]
    ordering_fields = ["created_at", "expected_date"]

    def get_queryset(self):
        return PurchaseOrder.objects.select_related("supplier", "created_by").prefetch_related("items")

    def perform_create(self, serializer):
        po = serializer.save(created_by=self.request.user)
        log_activity(self.request, "purchase_order.created", f"Created PO-{po.id} from {po.supplier.name}")

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def receive(self, request, pk=None):
        """
        Mark a PO received and create a Batch (+ stock-in movement) for
        each line item. Expects `expiry_date` per line in the request
        body: {"batches": [{"item_id": 1, "batch_number": "...", "expiry_date": "..."}]}
        """
        po = self.get_object()
        if po.status == PurchaseOrder.RECEIVED:
            return Response({"detail": "Order already received."}, status=400)

        batch_inputs = {b.get("item_id"): b for b in request.data.get("batches", [])}
        missing = [
            item.product.name for item in po.items.all()
            if not batch_inputs.get(item.id, {}).get("expiry_date")
        ]
        if missing:
            return Response(
                {"detail": f"Expiry date is required for: {', '.join(missing)}."},
                status=400,
            )

        for item in po.items.all():
            info = batch_inputs.get(item.id, {})
            batch = Batch.objects.create(
                product=item.product,
                batch_number=info.get("batch_number") or f"PO{po.id}-{item.id}",
                expiry_date=info["expiry_date"],
                quantity=item.quantity,
                cost_price=item.unit_cost,
                supplier=po.supplier,
            )
            StockMovement.objects.create(
                product=item.product,
                batch=batch,
                movement_type=StockMovement.IN,
                quantity=item.quantity,
                reason="Purchase order received",
                reference=f"PO-{po.id}",
                created_by=request.user,
            )
        po.status = PurchaseOrder.RECEIVED
        po.save(update_fields=["status"])
        log_activity(request, "purchase_order.received", f"Received PO-{po.id} from {po.supplier.name}")
        return Response(PurchaseOrderSerializer(po).data)
