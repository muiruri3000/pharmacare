from rest_framework_simplejwt.authentication import JWTAuthentication
from .context import set_current_tenant


class TenantScopedJWTAuthentication(JWTAuthentication):
    """
    Drop-in replacement for JWTAuthentication that also sets the
    current request's tenant in thread-local context once the user is
    resolved.

    This has to live in the authentication class (not a plain Django
    middleware): with DRF + JWT, request.user is only resolved inside
    APIView.dispatch(), after ordinary middleware has already run. Pair
    this with TenantCleanupMiddleware so the thread-local is always
    cleared at the end of the request even though it's set here.
    """

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None:
            user, token = result
            set_current_tenant(getattr(user, "tenant", None))
        return result
