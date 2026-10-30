from django.conf import settings
from django.db import models
from core.abstract_models import TenantScopedModel


class Prescription(TenantScopedModel):
    PENDING = "pending"
    DISPENSED = "dispensed"
    CANCELLED = "cancelled"
    STATUS_CHOICES = (
        (PENDING, "Pending"), (DISPENSED, "Dispensed"), (CANCELLED, "Cancelled"),
    )

    customer = models.ForeignKey("sales.Customer", on_delete=models.SET_NULL, null=True, related_name="prescriptions")
    prescribed_by = models.CharField(max_length=200, help_text="Prescribing doctor / clinic name.")
    notes = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=PENDING)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="prescriptions_logged"
    )
    dispensed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="prescriptions_dispensed",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        base_manager_name = "all_objects"

    def __str__(self):
        return f"Rx #{self.id} · {self.customer}"


class PrescriptionItem(models.Model):
    prescription = models.ForeignKey(Prescription, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey("inventory.Product", on_delete=models.PROTECT, related_name="prescription_items")
    quantity = models.PositiveIntegerField()
    dosage_instructions = models.CharField(max_length=255, blank=True)
    dispensed = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.quantity} × {self.product.name}"
