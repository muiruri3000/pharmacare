from django.conf import settings
from django.db import models
from core.abstract_models import TenantScopedModel


class Supplier(TenantScopedModel):
    name = models.CharField(max_length=200)
    contact_person = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    email = models.EmailField(blank=True)
    address = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        base_manager_name = "all_objects"

    def __str__(self):
        return self.name


class PurchaseOrder(TenantScopedModel):
    DRAFT = "draft"
    ORDERED = "ordered"
    RECEIVED = "received"
    CANCELLED = "cancelled"
    STATUS_CHOICES = (
        (DRAFT, "Draft"),
        (ORDERED, "Ordered"),
        (RECEIVED, "Received"),
        (CANCELLED, "Cancelled"),
    )

    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="purchase_orders")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=DRAFT)
    expected_date = models.DateField(null=True, blank=True)
    notes = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="purchase_orders"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        base_manager_name = "all_objects"

    def __str__(self):
        return f"PO-{self.id} · {self.supplier.name}"

    @property
    def total(self):
        return sum((item.quantity * item.unit_cost for item in self.items.all()), 0)


class PurchaseOrderItem(models.Model):
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey("inventory.Product", on_delete=models.PROTECT, related_name="purchase_items")
    quantity = models.PositiveIntegerField()
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2)

    def __str__(self):
        return f"{self.quantity} × {self.product.name}"
