from django.conf import settings
from django.db import models
from core.abstract_models import TenantScopedModel


class Category(TenantScopedModel):
    name = models.CharField(max_length=120)
    description = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["name"]
        base_manager_name = "all_objects"
        constraints = [
            models.UniqueConstraint(fields=["tenant", "name"], name="unique_category_per_tenant"),
        ]

    def __str__(self):
        return self.name


class Product(TenantScopedModel):
    """A drug/product the tenant stocks. Batches carry the actual quantity
    on hand and expiry — a Product with zero batches simply has no stock."""

    UNIT_CHOICES = (
        ("tablet", "Tablet"),
        ("capsule", "Capsule"),
        ("bottle", "Bottle"),
        ("vial", "Vial"),
        ("tube", "Tube"),
        ("box", "Box"),
        ("pack", "Pack"),
        ("strip", "Strip"),
        ("unit", "Unit"),
    )

    name = models.CharField(max_length=200)
    sku = models.CharField(max_length=64)
    barcode = models.CharField(
        max_length=64, blank=True,
        help_text="EAN/UPC or other scannable barcode. Optional — SKU still works as a manual fallback.",
    )
    category = models.ForeignKey(
        Category, on_delete=models.SET_NULL, null=True, blank=True, related_name="products"
    )
    manufacturer = models.CharField(max_length=200, blank=True)
    unit = models.CharField(max_length=20, choices=UNIT_CHOICES, default="unit")
    requires_prescription = models.BooleanField(default=False)

    cost_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    wholesale_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    retail_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    reorder_level = models.PositiveIntegerField(
        default=10, help_text="Trigger a low-stock flag when total quantity on hand falls to/below this."
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        base_manager_name = "all_objects"
        constraints = [
            models.UniqueConstraint(fields=["tenant", "sku"], name="unique_sku_per_tenant"),
            models.UniqueConstraint(
                fields=["tenant", "barcode"], name="unique_barcode_per_tenant",
                condition=models.Q(barcode__gt=""),
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.sku})"

    @property
    def quantity_on_hand(self):
        return self.batches.aggregate(total=models.Sum("quantity"))["total"] or 0

    @property
    def is_low_stock(self):
        return self.quantity_on_hand <= self.reorder_level


class Batch(TenantScopedModel):
    """A received lot of a product — carries the expiry date and the
    quantity remaining from that specific lot (FEFO dispensing relies
    on this: sell/dispense the nearest-expiry batch first)."""

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="batches")
    batch_number = models.CharField(max_length=100)
    expiry_date = models.DateField()
    quantity = models.IntegerField(default=0)
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    supplier = models.ForeignKey(
        "purchasing.Supplier", on_delete=models.SET_NULL, null=True, blank=True, related_name="batches"
    )
    received_date = models.DateField(auto_now_add=True)

    class Meta:
        ordering = ["expiry_date"]
        base_manager_name = "all_objects"

    def __str__(self):
        return f"{self.product.name} · {self.batch_number} (exp {self.expiry_date})"

    @property
    def is_expired(self):
        from django.utils import timezone
        return self.expiry_date < timezone.now().date()


class StockMovement(TenantScopedModel):
    """Immutable audit trail of every quantity change — receiving stock,
    a sale, a dispensed prescription, a manual adjustment, a write-off."""

    IN = "in"
    OUT = "out"
    ADJUSTMENT = "adjustment"
    MOVEMENT_TYPE_CHOICES = (
        (IN, "Stock in"),
        (OUT, "Stock out"),
        (ADJUSTMENT, "Adjustment"),
    )

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="movements")
    batch = models.ForeignKey(
        Batch, on_delete=models.SET_NULL, null=True, blank=True, related_name="movements"
    )
    movement_type = models.CharField(max_length=20, choices=MOVEMENT_TYPE_CHOICES)
    quantity = models.IntegerField(help_text="Positive for stock in, negative for stock out/adjustment down.")
    reason = models.CharField(max_length=255, blank=True)
    reference = models.CharField(
        max_length=100, blank=True, help_text="e.g. sale number, purchase order number, prescription id."
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="stock_movements"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        base_manager_name = "all_objects"

    def __str__(self):
        return f"{self.movement_type} {self.quantity} × {self.product.name}"
