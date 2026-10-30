"""
Thread-local storage for "which tenant is this request for". Set once
per request by TenantScopedJWTAuthentication (see authentication.py),
read by TenantScopedManager (see managers.py) so every query against a
tenant-owned model is automatically scoped — it is not possible to
accidentally write a queryset that leaks another pharmacy's data.
"""

import threading
from contextlib import contextmanager

_local = threading.local()


def set_current_tenant(tenant):
    _local.tenant = tenant


def get_current_tenant():
    return getattr(_local, "tenant", None)


def clear_current_tenant():
    """
    Must run at the end of every request — worker threads are reused
    across requests, so failing to clear this would leak one pharmacy's
    tenant into the next unrelated request handled by the same thread.
    """
    if hasattr(_local, "tenant"):
        del _local.tenant


@contextmanager
def tenant_context(tenant):
    """
    Temporarily set the current tenant for code with no request to
    derive it from — a management command looping over every tenant
    (e.g. nightly low-stock/expiry digest), or a background job that
    already knows which pharmacy it's operating on.
    """
    previous = get_current_tenant()
    set_current_tenant(tenant)
    try:
        yield
    finally:
        set_current_tenant(previous)
