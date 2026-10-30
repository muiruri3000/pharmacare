from django.db import models


class Tenant(models.Model):
    """
    A tenant of the pharmacy SaaS platform — one pharmacy business
    (a wholesale distributor or a retail pharmacy/chain).

    Every domain model (Product, Sale, Batch, ...) hangs off this via a
    direct `tenant` FK — see core.abstract_models.TenantScopedModel.
    Users also carry a `tenant` FK (accounts.models.User) so a login
    always resolves to exactly one business.
    """

    WHOLESALE = "wholesale"
    RETAIL = "retail"
    TENANT_TYPE_CHOICES = (
        (WHOLESALE, "Wholesale"),
        (RETAIL, "Retail"),
    )

    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    tenant_type = models.CharField(max_length=20, choices=TENANT_TYPE_CHOICES)

    # Business/contact details — light touch, extend as needed.
    phone = models.CharField(max_length=32, blank=True)
    email = models.EmailField(blank=True)
    address = models.CharField(max_length=255, blank=True)

    # Pharmacy regulatory identifiers (Kenya PPB-style; keep generic/optional
    # so this isn't tied to one jurisdiction).
    license_number = models.CharField(max_length=64, blank=True)
    license_expiry = models.DateField(null=True, blank=True)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.get_tenant_type_display()})"
