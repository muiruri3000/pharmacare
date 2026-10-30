from datetime import date, timedelta
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

from tenants.models import Tenant
from core.context import tenant_context
from inventory.models import Category, Product, Batch, StockMovement
from purchasing.models import Supplier

User = get_user_model()


class Command(BaseCommand):
    help = "Seed a demo retail tenant + wholesale tenant with users and sample products."

    def handle(self, *args, **options):
        retail, _ = Tenant.objects.get_or_create(
            slug="demo-retail",
            defaults={"name": "GreenLeaf Retail Pharmacy", "tenant_type": Tenant.RETAIL},
        )
        wholesale, _ = Tenant.objects.get_or_create(
            slug="demo-wholesale",
            defaults={"name": "BlueCross Wholesale Distributors", "tenant_type": Tenant.WHOLESALE},
        )

        for tenant, prefix in [(retail, "retail"), (wholesale, "wholesale")]:
            for role, username in [
                (User.ADMIN, f"{prefix}_admin"),
                (User.SALES, f"{prefix}_sales"),
                (User.TECHNICIAN, f"{prefix}_tech"),
            ]:
                if not User.objects.filter(username=username).exists():
                    User.objects.create_user(
                        username=username, password="Passw0rd!", role=role, tenant=tenant,
                        email=f"{username}@example.com",
                    )
                    self.stdout.write(self.style.SUCCESS(f"Created user {username} / Passw0rd!"))

            with tenant_context(tenant):
                supplier, _ = Supplier.objects.get_or_create(
                    name="MedSource Ltd", defaults={"phone": "+254700000000", "email": "orders@medsource.example"}
                )
                category, _ = Category.objects.get_or_create(name="Analgesics")
                product, created = Product.objects.get_or_create(
                    sku=f"{prefix.upper()}-PARA500",
                    defaults=dict(
                        name="Paracetamol 500mg", category=category, manufacturer="GenPharm",
                        unit="tablet", requires_prescription=False,
                        cost_price=2, wholesale_price=3.5, retail_price=6,
                        reorder_level=100,
                    ),
                )
                if created:
                    batch = Batch.objects.create(
                        product=product, batch_number="B-0001",
                        expiry_date=date.today() + timedelta(days=365),
                        quantity=500, cost_price=2, supplier=supplier,
                    )
                    StockMovement.objects.create(
                        product=product, batch=batch, movement_type=StockMovement.IN,
                        quantity=500, reason="Initial stock", reference="SEED",
                    )

        self.stdout.write(self.style.SUCCESS(
            "\nDemo tenants ready:\n"
            "  Retail   — retail_admin / retail_sales / retail_tech   (password: Passw0rd!)\n"
            "  Wholesale — wholesale_admin / wholesale_sales / wholesale_tech (password: Passw0rd!)\n"
        ))
