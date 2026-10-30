from django.db import transaction
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.response import Response

from core.activity import log_activity
from core.permissions import PrescriptionPermission
from core.pagination import DefaultPagination
from inventory.models import Batch, StockMovement
from .models import Prescription
from .serializers import PrescriptionSerializer


class PrescriptionViewSet(viewsets.ModelViewSet):
    serializer_class = PrescriptionSerializer
    permission_classes = [PrescriptionPermission]
    pagination_class = DefaultPagination
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["customer__name", "prescribed_by"]
    ordering_fields = ["created_at"]

    def get_queryset(self):
        return Prescription.objects.select_related("customer", "created_by", "dispensed_by").prefetch_related("items")

    def perform_create(self, serializer):
        rx = serializer.save(created_by=self.request.user)
        log_activity(self.request, "prescription.created", f"Logged Rx #{rx.id} for {rx.customer or 'walk-in'}")

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def dispense(self, request, pk=None):
        """Technician action: deduct stock FEFO for every item, mark dispensed."""
        rx = self.get_object()
        if rx.status == Prescription.DISPENSED:
            return Response({"detail": "Already dispensed."}, status=400)

        for item in rx.items.all():
            remaining = item.quantity
            for batch in Batch.objects.filter(product=item.product, quantity__gt=0).order_by("expiry_date"):
                if remaining <= 0:
                    break
                take = min(batch.quantity, remaining)
                batch.quantity -= take
                batch.save(update_fields=["quantity"])
                StockMovement.objects.create(
                    product=item.product, batch=batch, movement_type=StockMovement.OUT,
                    quantity=-take, reason="Prescription dispensed", reference=f"Rx-{rx.id}",
                    created_by=request.user,
                )
                remaining -= take
            if remaining > 0:
                # `raise`, not `return` — this is inside @transaction.atomic,
                # which only rolls back on a propagated exception. A plain
                # `return Response(..., 400)` here would commit whatever
                # earlier items in this same prescription already deducted,
                # while reporting the whole call as failed.
                raise ValidationError(
                    f"Insufficient stock for {item.product.name}: short by {remaining}."
                )
            item.dispensed = True
            item.save(update_fields=["dispensed"])

        rx.status = Prescription.DISPENSED
        rx.dispensed_by = request.user
        rx.save(update_fields=["status", "dispensed_by"])
        log_activity(request, "prescription.dispensed", f"Dispensed Rx #{rx.id}")
        return Response(PrescriptionSerializer(rx).data)
