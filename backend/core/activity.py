from .models import ActivityLog


def log_activity(request, action, description):
    """
    Record a business-level event for the activity feed. Call this
    from view code (perform_create, custom @action methods) right
    after the operation it describes succeeds — never from inside a
    model's save() or a signal, so it stays an explicit, readable
    trail of "what a person did" rather than every internal write.

    `request` supplies both the tenant (via TenantScopedManager's
    thread-local context, already set by the time a view runs) and
    the user. Safe to call unauthenticated request objects too (user
    will just be None) though in practice every call site here is
    already behind an IsAuthenticated-derived permission class.
    """
    user = getattr(request, "user", None)
    ActivityLog.objects.create(
        action=action,
        description=description,
        user=user if user is not None and getattr(user, "is_authenticated", False) else None,
    )
