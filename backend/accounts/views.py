from django.contrib.auth import get_user_model
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView

from core.activity import log_activity
from core.permissions import IsAdmin
from .serializers import (
    UserSerializer,
    UserCreateSerializer,
    ChangePasswordSerializer,
    MeSerializer,
)

User = get_user_model()


class TenantAwareTokenObtainPairView(TokenObtainPairView):
    """
    Same login endpoint/response shape as vanilla simplejwt (access +
    refresh) — the frontend's authApi.login() reads tokens from this
    response and then calls /auth/me/ separately for the user object,
    so no custom serializer is needed here.
    """

    pass


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def me(request):
    return Response(MeSerializer(request.user).data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def change_password(request):
    serializer = ChangePasswordSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = request.user
    if not user.check_password(serializer.validated_data["old_password"]):
        return Response({"detail": "Old password is incorrect."}, status=400)
    user.set_password(serializer.validated_data["new_password"])
    user.save()
    return Response({"detail": "Password updated."})


class UserViewSet(viewsets.ModelViewSet):
    """
    Admin-only: manage the employees (sales/technician/admin accounts)
    of the caller's own tenant. User.objects is NOT tenant-scoped by
    design (see accounts/models.py), so this view filters explicitly —
    without that, any tenant's admin could list/edit/delete every other
    tenant's user accounts.
    """

    queryset = User.objects.all().order_by("username")
    permission_classes = [IsAdmin]
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["username", "email", "first_name", "last_name", "role"]
    ordering_fields = ["username", "date_joined"]

    def get_queryset(self):
        return User.objects.filter(tenant=self.request.user.tenant).order_by("username")

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        return UserSerializer

    def perform_create(self, serializer):
        user = serializer.save(tenant=self.request.user.tenant)
        log_activity(self.request, "user.created", f"Created user {user.username} ({user.get_role_display()})")

    def perform_destroy(self, instance):
        # Soft-delete: preserve history (sales rung up, stock movements
        # recorded) instead of cascading deletes through business data.
        instance.is_active_employee = False
        instance.is_active = False
        instance.save(update_fields=["is_active_employee", "is_active"])
        log_activity(self.request, "user.deactivated", f"Deactivated user {instance.username}")
