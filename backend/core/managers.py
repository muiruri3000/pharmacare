from django.db import models
from .context import get_current_tenant


class TenantScopedQuerySet(models.QuerySet):
    def _inject_tenant(self, kwargs):
        if "tenant" not in kwargs and "tenant_id" not in kwargs:
            tenant = get_current_tenant()
            if tenant is not None:
                kwargs["tenant"] = tenant
        return kwargs

    def create(self, **kwargs):
        # get_or_create()/update_or_create() call THIS (QuerySet.create),
        # not Manager.create() — so the injection has to live here, not
        # only on the manager, or those two call paths silently skip it
        # and hit a NOT NULL constraint on tenant_id instead.
        return super().create(**self._inject_tenant(kwargs))

    def get_or_create(self, defaults=None, **kwargs):
        defaults = self._inject_tenant(dict(defaults or {}))
        return super().get_or_create(defaults=defaults, **kwargs)

    def update_or_create(self, defaults=None, create_defaults=None, **kwargs):
        create_defaults = self._inject_tenant(dict(create_defaults or defaults or {}))
        return super().update_or_create(defaults=defaults, create_defaults=create_defaults, **kwargs)


class TenantScopedManager(models.Manager):
    """
    Default manager for every tenant-owned model. Filters to the
    current request's tenant automatically and refuses to return an
    unscoped queryset — `Product.objects.all()` is safe everywhere
    (views, serializers, signals, shell) because it *cannot* return
    another pharmacy's rows.

    For genuine cross-tenant access (platform admin tooling, a
    management command that loops over every tenant, a data
    migration), use `Model.all_objects` instead — deliberately named
    to stand out in review/grep.
    """

    def get_queryset(self):
        qs = TenantScopedQuerySet(self.model, using=self._db)
        tenant = get_current_tenant()
        if tenant is None:
            raise RuntimeError(
                f"No tenant in context — refusing to return an unscoped "
                f"{self.model.__name__} queryset. If this is intentional "
                f"(admin tooling, a management command, a migration), use "
                f"{self.model.__name__}.all_objects instead."
            )
        return qs.filter(tenant=tenant)

    def create(self, **kwargs):
        return self.get_queryset().create(**kwargs)
