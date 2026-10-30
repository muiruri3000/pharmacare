from datetime import date, timedelta
from decimal import Decimal

from core.context import tenant_context
from core.test_utils import TenantAPITestCase
from inventory.models import Product, Batch


class SalesSummaryTests(TenantAPITestCase):
    def setUp(self):
        super().setUp()
        with tenant_context(self.tenant):
            self.product = Product.objects.create(
                name="Paracetamol 500mg", sku="PARA500", unit="tablet",
                cost_price=2, wholesale_price=3.5, retail_price=6, reorder_level=10,
            )
            Batch.objects.create(
                product=self.product, batch_number="B1",
                expiry_date=date.today() + timedelta(days=365), quantity=1000, cost_price=2,
            )

    def test_non_admin_cannot_view_reports(self):
        self.login_as(self.sales)
        self.assertEqual(self.client.get("/api/reports/sales-summary/").status_code, 403)
        self.assertEqual(self.client.get("/api/reports/inventory-valuation/").status_code, 403)

    def test_sales_summary_does_not_inflate_discount_for_multi_item_sale(self):
        # Regression test for a real fan-out bug: joining the one-to-many
        # `items` relation into the same annotate() as a Sale-level field
        # (discount) multiplies discount by the number of line items in
        # the sale. A single sale with 2 items and a discount of 5 must
        # report discount=5 for the day, not 10.
        self.login_as(self.sales)
        res = self.client.post("/api/sales/", {
            "payment_method": "cash", "discount": "5.00", "tax": 0,
            "items": [
                {"product": self.product.id, "quantity": 2},
                {"product": self.product.id, "quantity": 3},
            ],
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)

        self.login_as(self.admin)
        res = self.client.get("/api/reports/sales-summary/?period=day")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(len(res.data["results"]), 1)
        day = res.data["results"][0]
        self.assertEqual(day["sale_count"], 1)  # not 2 (one per line item)
        self.assertEqual(Decimal(day["subtotal"]), Decimal("30.00"))  # (2+3) * 6.00
        self.assertEqual(Decimal(day["discount"]), Decimal("5.00"))   # not 10.00
        self.assertEqual(Decimal(day["total"]), Decimal("25.00"))

    def test_sales_summary_excludes_voided_sales(self):
        self.login_as(self.sales)
        res = self.client.post("/api/sales/", {
            "payment_method": "cash", "discount": 0, "tax": 0,
            "items": [{"product": self.product.id, "quantity": 1}],
        }, format="json")
        sale_id = res.data["id"]

        self.login_as(self.admin)
        self.client.post(f"/api/sales/{sale_id}/void/")
        res = self.client.get("/api/reports/sales-summary/?period=day")
        self.assertEqual(res.data["results"], [])

    def test_sales_by_payment_method_counts_correctly_for_multi_item_sale(self):
        self.login_as(self.sales)
        self.client.post("/api/sales/", {
            "payment_method": "mpesa", "discount": 0, "tax": 0,
            "items": [
                {"product": self.product.id, "quantity": 1},
                {"product": self.product.id, "quantity": 1},
                {"product": self.product.id, "quantity": 1},
            ],
        }, format="json")
        self.login_as(self.admin)
        res = self.client.get("/api/reports/sales-by-payment-method/")
        self.assertEqual(res.status_code, 200)
        row = next(r for r in res.data["results"] if r["payment_method"] == "mpesa")
        self.assertEqual(row["sale_count"], 1)  # one sale, not three
        self.assertEqual(Decimal(row["total"]), Decimal("18.00"))  # 3 * 6.00

    def test_top_products_orders_by_revenue(self):
        with tenant_context(self.tenant):
            cheap = Product.objects.create(
                name="Cheap Vitamin", sku="VITC", unit="tablet",
                cost_price=1, wholesale_price=1, retail_price=1, reorder_level=10,
            )
            Batch.objects.create(
                product=cheap, batch_number="B2",
                expiry_date=date.today() + timedelta(days=365), quantity=1000, cost_price=1,
            )
        self.login_as(self.sales)
        # 10 x $1 cheap vitamin = $10 revenue; 1 x $6 paracetamol = $6 revenue
        self.client.post("/api/sales/", {
            "payment_method": "cash", "discount": 0, "tax": 0,
            "items": [{"product": cheap.id, "quantity": 10}],
        }, format="json")
        self.client.post("/api/sales/", {
            "payment_method": "cash", "discount": 0, "tax": 0,
            "items": [{"product": self.product.id, "quantity": 1}],
        }, format="json")

        self.login_as(self.admin)
        res = self.client.get("/api/reports/top-products/?by=revenue")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["results"][0]["sku"], "VITC")

    def test_inventory_valuation_basic_math(self):
        self.login_as(self.admin)
        res = self.client.get("/api/reports/inventory-valuation/")
        self.assertEqual(res.status_code, 200)
        # 1000 units * cost_price 2.00
        self.assertEqual(Decimal(res.data["total_cost_value"]), Decimal("2000.00"))
        self.assertEqual(Decimal(res.data["total_retail_value"]), Decimal("6000.00"))

    def test_inventory_valuation_flags_expired_stock_separately(self):
        with tenant_context(self.tenant):
            Batch.objects.create(
                product=self.product, batch_number="EXPIRED",
                expiry_date=date.today() - timedelta(days=5), quantity=50, cost_price=2,
            )
        self.login_as(self.admin)
        res = self.client.get("/api/reports/inventory-valuation/")
        self.assertEqual(Decimal(res.data["expired_stock_cost_value"]), Decimal("100.00"))  # 50 * 2.00

    def test_inventory_valuation_tenant_isolated(self):
        self.login_as(self.other_admin)
        res = self.client.get("/api/reports/inventory-valuation/")
        self.assertEqual(Decimal(res.data["total_cost_value"]), Decimal("0"))
