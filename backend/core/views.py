from rest_framework import viewsets
from rest_framework.filters import SearchFilter, OrderingFilter

from .models import ActivityLog
from .serializers import ActivityLogSerializer
from .pagination import DefaultPagination
from .permissions import IsAdmin


class ActivityLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only — the activity feed is a record of what happened, never edited."""

    serializer_class = ActivityLogSerializer
    permission_classes = [IsAdmin]
    pagination_class = DefaultPagination
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["action", "description", "user__username"]
    ordering_fields = ["created_at"]

    def get_queryset(self):
        qs = ActivityLog.objects.select_related("user").all()
        action_prefix = self.request.query_params.get("action")
        if action_prefix:
            qs = qs.filter(action__startswith=action_prefix)
        return qs
