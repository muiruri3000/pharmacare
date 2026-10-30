from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    ADMIN = "admin"
    SALES = "sales"
    TECHNICIAN = "technician"
    ROLE_CHOICES = (
        (ADMIN, "Admin"),
        (SALES, "Sales"),
        (TECHNICIAN, "Pharmacy Technician"),
    )

    role = models.CharField(max_length=20, choices=ROLE_CHOICES, blank=True)

    # Deliberately NOT TenantScopedModel: authenticating a user (looking
    # them up by username) has to work *before* any tenant is known, so
    # User.objects must stay the plain, unscoped UserManager. Tenant
    # scoping for user lists happens explicitly in UserViewSet.get_queryset.
    #
    # null=True/blank=True permanently (not transitional) — it's what
    # lets a platform superuser exist with no tenant at all, for
    # cross-tenant admin/onboarding tooling. Every regular user should
    # have one set; enforce that in the create-user serializer, not at
    # the DB level (the DB-level constraint would rule out the
    # superuser case).
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="users",
    )
    phone = models.CharField(max_length=32, blank=True)
    is_active_employee = models.BooleanField(
        default=True,
        help_text="Deactivate to revoke access without deleting the account/history.",
    )

    def __str__(self):
        return self.username
