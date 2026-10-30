from django.db import models
from .managers import TenantScopedManager


class TenantScopedModel(models.Model):
    """
    Base class for every model that belongs to a single pharmacy
    tenant (wholesale or retail). Gives the model a direct `tenant` FK
    plus two managers:

    - `objects` (default): tenant-scoped, safe by default.
    - `all_objects`: unscoped escape hatch for admin/scripts only.
    """

    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="%(app_label)s_%(class)s_set",
    )

    objects = TenantScopedManager()
    all_objects = models.Manager()

    class Meta:
        abstract = True
        # Django uses _base_manager (NOT objects/_default_manager) for
        # internal machinery — instance.refresh_from_db(), delete()'s
        # cascade collector, dumpdata — none of which run inside a
        # request and so have no tenant in context. Point it at the
        # unscoped manager so those keep working; `objects` stays the
        # default for everything else (including the querysets DRF
        # auto-builds for FK fields, which is what makes "you can't
        # reference another tenant's category/product by id" work).
        base_manager_name = "all_objects"
