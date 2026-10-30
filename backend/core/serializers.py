from rest_framework import serializers
from .models import ActivityLog


class ActivityLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.username", read_only=True, default=None)

    class Meta:
        model = ActivityLog
        fields = ["id", "action", "description", "user", "user_name", "created_at"]
