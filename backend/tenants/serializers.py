from rest_framework import serializers
from .models import Tenant


class TenantSerializer(serializers.ModelSerializer):
    tenant_type_display = serializers.CharField(source="get_tenant_type_display", read_only=True)

    class Meta:
        model = Tenant
        fields = [
            "id", "name", "slug", "tenant_type", "tenant_type_display",
            "phone", "email", "address", "license_number", "license_expiry",
            "is_active", "created_at",
        ]
        read_only_fields = ["id", "created_at"]
