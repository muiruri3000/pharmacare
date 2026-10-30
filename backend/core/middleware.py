from .context import get_current_tenant, set_current_tenant


class TenantCleanupMiddleware:
    """
    Restores the thread-local tenant context to whatever it was before
    this request, once the request finishes. Guards against one user's
    tenant leaking into the next request handled by the same worker
    thread. Also sets tenant context for session-authenticated requests
    (the Django admin site), since those never go through DRF's
    authentication classes.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        previous = get_current_tenant()
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            set_current_tenant(getattr(user, "tenant", None))
        try:
            response = self.get_response(request)
        finally:
            set_current_tenant(previous)
        return response
