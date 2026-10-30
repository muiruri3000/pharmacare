"""
Read-only, admin-only reporting endpoints. Deliberately not model-backed
DRF viewsets — every report here is a computed aggregate over existing
data (Sale, SaleItem, Batch, Product), so plain function-based views
returning ad-hoc dicts are a better fit than serializers for models
that don't exist.
"""

from datetime import datetime, timedelta

from django.db.models import Sum, F, DecimalField, ExpressionWrapper, Count
from django.db.models.functions import TruncDate, TruncWeek, TruncMonth
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from core.permissions import IsAdmin
from inventory.models import Product, Batch
from sales.models import Sale, SaleItem

MONEY = DecimalField(max_digits=14, decimal_places=2)


def _parse_date_range(request, default_days=30):
    """Returns (start, end) as date objects. `end` defaults to today,
    `start` to `default_days` before that, unless overridden by
    ?start=YYYY-MM-DD&end=YYYY-MM-DD."""
    today = timezone.now().date()
    end_str = request.query_params.get("end")
    start_str = request.query_params.get("start")
    try:
        end = datetime.strptime(end_str, "%Y-%m-%d").date() if end_str else today
    except ValueError:
        end = today
    try:
        start = datetime.strptime(start_str, "%Y-%m-%d").date() if start_str else end - timedelta(days=default_days)
    except ValueError:
        start = end - timedelta(days=default_days)
    return start, end


@api_view(["GET"])
@permission_classes([IsAdmin])
def sales_summary(request):
    """
    Time-bucketed sales trend. ?period=day|week|month (default day),
    ?start=&end= (default: last 30 days). Void sales are excluded —
    a voided sale never happened as far as revenue reporting goes.

    Deliberately TWO separate grouped queries, not one. Joining the
    one-to-many `items` relation into the same annotate() as Sale-level
    fields (discount, tax, a plain Count("id")) causes row fan-out: a
    sale with 3 line items would have its discount summed 3x and counted
    3x. Line-item revenue is aggregated from SaleItem; discount/tax/count
    are aggregated straight from Sale with no join — then merged by bucket.
    """
    period = request.query_params.get("period", "day")
    trunc = {"day": TruncDate, "week": TruncWeek, "month": TruncMonth}.get(period, TruncDate)
    start, end = _parse_date_range(request)

    sale_level = (
        Sale.objects.filter(status=Sale.COMPLETED, created_at__date__gte=start, created_at__date__lte=end)
        .annotate(bucket=trunc("created_at"))
        .values("bucket")
        .annotate(sale_count=Count("id"), discount=Sum("discount"), tax=Sum("tax"))
    )
    item_level = (
        SaleItem.objects.filter(
            sale__status=Sale.COMPLETED,
            sale__created_at__date__gte=start,
            sale__created_at__date__lte=end,
        )
        .annotate(bucket=trunc("sale__created_at"))
        .values("bucket")
        .annotate(subtotal=Sum(ExpressionWrapper(F("quantity") * F("unit_price"), output_field=MONEY)))
    )
    subtotal_by_bucket = {row["bucket"]: row["subtotal"] or 0 for row in item_level}

    results = []
    for row in sale_level.order_by("bucket"):
        subtotal = subtotal_by_bucket.get(row["bucket"], 0)
        discount = row["discount"] or 0
        tax = row["tax"] or 0
        results.append({
            "period": row["bucket"].isoformat() if row["bucket"] else None,
            "sale_count": row["sale_count"],
            "subtotal": subtotal,
            "discount": discount,
            "tax": tax,
            "total": subtotal - discount + tax,
        })
    return Response({"start": start, "end": end, "period": period, "results": results})


@api_view(["GET"])
@permission_classes([IsAdmin])
def sales_by_payment_method(request):
    # Same fan-out hazard as sales_summary — split for the same reason.
    start, end = _parse_date_range(request)
    sale_level = {
        row["payment_method"]: row["sale_count"]
        for row in (
            Sale.objects.filter(status=Sale.COMPLETED, created_at__date__gte=start, created_at__date__lte=end)
            .values("payment_method")
            .annotate(sale_count=Count("id"))
        )
    }
    item_level = (
        SaleItem.objects.filter(
            sale__status=Sale.COMPLETED,
            sale__created_at__date__gte=start,
            sale__created_at__date__lte=end,
        )
        .values("sale__payment_method")
        .annotate(total=Sum(ExpressionWrapper(F("quantity") * F("unit_price"), output_field=MONEY)))
    )
    results = [
        {
            "payment_method": row["sale__payment_method"],
            "sale_count": sale_level.get(row["sale__payment_method"], 0),
            "total": row["total"] or 0,
        }
        for row in item_level
    ]
    results.sort(key=lambda r: -r["total"])
    return Response({"start": start, "end": end, "results": results})


@api_view(["GET"])
@permission_classes([IsAdmin])
def top_products(request):
    """?by=revenue|quantity (default revenue), ?limit=10, ?start=&end=."""
    start, end = _parse_date_range(request, default_days=90)
    limit = min(int(request.query_params.get("limit", 10)), 100)
    order_by = "-quantity_sold" if request.query_params.get("by") == "quantity" else "-revenue"

    qs = (
        SaleItem.objects.filter(
            sale__status=Sale.COMPLETED,
            sale__created_at__date__gte=start,
            sale__created_at__date__lte=end,
        )
        .values("product__id", "product__name", "product__sku")
        .annotate(
            quantity_sold=Sum("quantity"),
            revenue=Sum(ExpressionWrapper(F("quantity") * F("unit_price"), output_field=MONEY)),
        )
        .order_by(order_by)[:limit]
    )
    results = [
        {
            "product_id": row["product__id"],
            "product_name": row["product__name"],
            "sku": row["product__sku"],
            "quantity_sold": row["quantity_sold"] or 0,
            "revenue": row["revenue"] or 0,
        }
        for row in qs
    ]
    return Response({"start": start, "end": end, "results": results})


@api_view(["GET"])
@permission_classes([IsAdmin])
def inventory_valuation(request):
    """
    Current-state snapshot (no date range) of what's on the shelves
    right now: cost basis, and potential revenue at retail/wholesale
    price, plus how much of that cost basis is sitting in already-
    expired batches (dead stock that needs writing off, not sold).
    """
    today = timezone.now().date()
    batches = Batch.objects.filter(quantity__gt=0).select_related("product", "product__category")

    total_cost = 0
    total_retail = 0
    total_wholesale = 0
    expired_cost = 0
    by_category = {}

    for batch in batches:
        cost_value = batch.quantity * batch.cost_price
        retail_value = batch.quantity * batch.product.retail_price
        wholesale_value = batch.quantity * batch.product.wholesale_price
        total_cost += cost_value
        total_retail += retail_value
        total_wholesale += wholesale_value
        if batch.expiry_date < today:
            expired_cost += cost_value

        cat_name = batch.product.category.name if batch.product.category_id else "Uncategorised"
        bucket = by_category.setdefault(cat_name, {"category": cat_name, "quantity": 0, "cost_value": 0, "retail_value": 0})
        bucket["quantity"] += batch.quantity
        bucket["cost_value"] += cost_value
        bucket["retail_value"] += retail_value

    return Response({
        "as_of": today,
        "total_cost_value": total_cost,
        "total_retail_value": total_retail,
        "total_wholesale_value": total_wholesale,
        "expired_stock_cost_value": expired_cost,
        "active_product_count": Product.objects.filter(is_active=True).count(),
        "by_category": sorted(by_category.values(), key=lambda r: -r["cost_value"]),
    })
