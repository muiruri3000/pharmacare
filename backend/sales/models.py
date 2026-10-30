from django.conf import settings
from django.db import models
from core.abstract_models import TenantScopedModel


class Customer(TenantScopedModel):
    WALK_IN = "walk_in"
    WHOLESALE_CLIENT = "wholesale_client"
    CUSTOMER_TYPE_CHOICES = (
        (WALK_IN, "Walk-in"),
        (WHOLESALE_CLIENT, "Wholesale client"),
    )

    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=32, blank=True)
    email = models.EmailField(blank=True)
    customer_type = models.CharField(max_length=20, choices=CUSTOMER_TYPE_CHOICES, default=WALK_IN)
    credit_limit = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        ordering = ["name"]
        base_manager_name = "all_objects"

    def __str__(self):
        return self.name


class Sale(TenantScopedModel):
    COMPLETED = "completed"
    VOID = "void"
    STATUS_CHOICES = ((COMPLETED, "Completed"), (VOID, "Void"))

    CASH = "cash"
    MPESA = "mpesa"
    CARD = "card"
    CREDIT = "credit"
    PAYMENT_METHOD_CHOICES = (
        (CASH, "Cash"), (MPESA, "M-Pesa"), (CARD, "Card"), (CREDIT, "Credit"),
    )

    customer = models.ForeignKey(
        Customer, on_delete=models.SET_NULL, null=True, blank=True, related_name="sales"
    )
    sold_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="sales"
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=COMPLETED)
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, default=CASH)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    prescription = models.ForeignKey(
        "prescriptions.Prescription", on_delete=models.SET_NULL, null=True, blank=True, related_name="sales"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        base_manager_name = "all_objects"

    def __str__(self):
        return f"Sale #{self.id}"

    @property
    def subtotal(self):
        return sum((i.quantity * i.unit_price for i in self.items.all()), 0)

    @property
    def total(self):
        return self.subtotal - self.discount + self.tax


class SaleItem(models.Model):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey("inventory.Product", on_delete=models.PROTECT, related_name="sale_items")
    batch = models.ForeignKey(
        "inventory.Batch", on_delete=models.SET_NULL, null=True, blank=True, related_name="sale_items"
    )
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)

    def __str__(self):
        return f"{self.quantity} × {self.product.name}"

    @property
    def subtotal(self):
        return self.quantity * self.unit_price
