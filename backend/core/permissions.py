"""
Role-based permission classes shared across every domain app.

Three roles, mirrored 1:1 on the frontend (src/lib/auth/permissions.ts):

- admin      → everything within their own tenant, including deleting
               records and managing users.
- sales      → point-of-sale: create sales, view/search products &
               batches (read-only), manage customers, view their own
               sales history. No purchasing, no user management, no
               deleting inventory or other people's sales.
- technician → inventory & dispensing: manage products, batches, stock
               movements, and dispense against prescriptions. No sales
               (POS/financial) access, no user management.

All object-level access is additionally scoped to the caller's tenant
by TenantScopedManager — these classes only decide *what a role may
do*, never *whose rows they may see* (that's automatic).
"""

from rest_framework.permissions import BasePermission, SAFE_METHODS

ADMIN = "admin"
SALES = "sales"
TECHNICIAN = "technician"


def role_of(user):
    if not user or not user.is_authenticated:
        return None
    return getattr(user, "role", None)


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return role_of(request.user) == ADMIN


class IsAdminOrSales(BasePermission):
    def has_permission(self, request, view):
        return role_of(request.user) in (ADMIN, SALES)


class IsAdminOrTechnician(BasePermission):
    def has_permission(self, request, view):
        return role_of(request.user) in (ADMIN, TECHNICIAN)


class InventoryPermission(BasePermission):
    """
    Products / Batches / Stock movements.
    - admin: full access.
    - technician: full access except deleting products (deactivate
      instead — see ProductViewSet.perform_destroy).
    - sales: read-only (needs to look up stock while ringing up a sale).
    """

    def has_permission(self, request, view):
        role = role_of(request.user)
        if role is None:
            return False
        if role == SALES:
            return request.method in SAFE_METHODS
        if role in (ADMIN, TECHNICIAN):
            if request.method == "DELETE" and role != ADMIN:
                return False
            return True
        return False


class SalesPermission(BasePermission):
    """
    Sales / Customers.
    - admin: full access.
    - sales: read/create/update; cannot delete or void another user's
      sale (enforced in the view via object-level checks).
    - technician: read-only (needs customer/sale context for dispensing
      against a prescription tied to a sale).
    """

    def has_permission(self, request, view):
        role = role_of(request.user)
        if role is None:
            return False
        if role == TECHNICIAN:
            return request.method in SAFE_METHODS
        if role in (ADMIN, SALES):
            if role != ADMIN and (request.method == "DELETE" or getattr(view, "action", None) == "void"):
                # Voiding is also enforced independently inside
                # SaleViewSet.void() — this is belt-and-suspenders so
                # the permission class stays the actual source of
                # truth rather than relying on that view-level check.
                return False
            return True
        return False


class PurchasingPermission(BasePermission):
    """
    Suppliers / Purchase orders.
    - admin: full access.
    - technician: read/create/update (receiving stock); no delete.
    - sales: read-only.
    """

    def has_permission(self, request, view):
        role = role_of(request.user)
        if role is None:
            return False
        if role == SALES:
            return request.method in SAFE_METHODS
        if role in (ADMIN, TECHNICIAN):
            if request.method == "DELETE" and role != ADMIN:
                return False
            return True
        return False


class PrescriptionPermission(BasePermission):
    """
    Prescriptions.
    - admin: full access.
    - technician: full access except delete (dispensing is their job).
    - sales: read/create only (can log a prescription at checkout, but
      dispensing/fulfilment is a technician action).
    """

    def has_permission(self, request, view):
        role = role_of(request.user)
        if role is None:
            return False
        if role == SALES:
            # "POST" alone isn't specific enough — the dispense action
            # is also a POST, and sales must never reach it. Check the
            # viewset action name, not just the HTTP method.
            if getattr(view, "action", None) == "dispense":
                return False
            return request.method in SAFE_METHODS or view.action == "create"
        if role in (ADMIN, TECHNICIAN):
            if request.method == "DELETE" and role != ADMIN:
                return False
            return True
        return False
