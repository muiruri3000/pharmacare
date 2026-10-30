from django.urls import path
from . import views

urlpatterns = [
    path("reports/sales-summary/", views.sales_summary, name="report-sales-summary"),
    path("reports/sales-by-payment-method/", views.sales_by_payment_method, name="report-sales-by-payment-method"),
    path("reports/top-products/", views.top_products, name="report-top-products"),
    path("reports/inventory-valuation/", views.inventory_valuation, name="report-inventory-valuation"),
]
