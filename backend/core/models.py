from django.conf import settings
from django.db import models
from .abstract_models import TenantScopedModel


class ActivityLog(TenantScopedModel):
    """
    Business-level audit trail: "who did what, when" across sales,
    purchasing, prescriptions, and user management. Deliberately
    separate from inventory.StockMovement, which already tracks every
    quantity change in detail — ActivityLog captures the higher-level
    business events (a sale was rung up, an order was received, a user
    was deactivated) rather than every field-level change, so it stays
    readable as a feed instead of a firehose.

    Written explicitly from view code via core.activity.log_activity(),
    not via blanket model signals — a signal on every model.save()
    would also fire on internal bookkeeping saves (e.g. a batch's
    quantity ticking down during a sale, which StockMovement already
    covers) and bury the events that actually matter to a pharmacy
    owner skimming this feed.
    """

    action = models.CharField(
        max_length=50,
        help_text="Dot-namespaced event, e.g. 'sale.created', 'sale.voided', 'user.deactivated'.",
    )
    description = models.CharField(max_length=255)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="activity_log_entries"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        base_manager_name = "all_objects"

    def __str__(self):
        return f"{self.action}: {self.description}"
