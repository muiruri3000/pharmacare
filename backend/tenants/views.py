from rest_framework import viewsets, permissions
from .models import Tenant
from .serializers import TenantSerializer


class TenantViewSet(viewsets.ModelViewSet):
    """
    Platform-level: lists/edits the caller's own tenant only (a business
    can see and edit its own settings, never another business's).
    Superusers (platform admins) see every tenant — used for onboarding
    new pharmacies onto the SaaS, not exposed to regular users.
    """

    serializer_class = TenantSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser:
            return Tenant.objects.all().order_by("name")
        if user.tenant_id:
            return Tenant.objects.filter(id=user.tenant_id)
        return Tenant.objects.none()
