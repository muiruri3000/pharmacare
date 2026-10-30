"""
Populate existing tenants with realistic demo data — catalogue, suppliers,
purchase orders, customers, historical sales, prescriptions and stock
adjustments — so the dashboard and reports have something meaningful to show.

Deliberately does NOT create or modify users: run `seed_demo` first for the
tenants + logins, then this for the data. Keeping them separate means you can
re-seed data repeatedly (or with --fresh) without ever touching credentials.

Usage:
    python manage.py seed_data                 # add data to every tenant
    python manage.py seed_data --days 120      # spread sales over 120 days
    python manage.py seed_data --fresh         # wipe existing non-user data first
    python manage.py seed_data --tenant demo-retail
"""

import random
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from tenants.models import Tenant
from core.context import tenant_context
from core.models import ActivityLog
from inventory.models import Category, Product, Batch, StockMovement
from purchasing.models import Supplier, PurchaseOrder, PurchaseOrderItem
from sales.models import Customer, Sale, SaleItem
from prescriptions.models import Prescription, PrescriptionItem

CATEGORIES = [
    ("Analgesics", "Pain relief and fever reducers"),
    ("Antibiotics", "Bacterial infection treatments"),
    ("Antimalarials", "Malaria treatment and prophylaxis"),
    ("Cardiovascular", "Blood pressure, cholesterol and heart medication"),
    ("Diabetes Care", "Insulin, oral hypoglycaemics and monitoring supplies"),
    ("Vitamins & Supplements", "Micronutrients and dietary supplements"),
    ("Respiratory", "Asthma, allergy and cough preparations"),
    ("Dermatology", "Topical creams, ointments and antiseptics"),
    ("First Aid", "Dressings, bandages and wound care"),
    ("Maternal & Child Health", "Prenatal, paediatric and infant care"),
]

# (name, category, manufacturer, unit, rx_required, cost, wholesale, retail, reorder_level)
PRODUCTS = [
    ("Paracetamol 500mg", "Analgesics", "GenPharm", "tablet", False, 2, 3.5, 6, 200),
    ("Ibuprofen 400mg", "Analgesics", "GenPharm", "tablet", False, 3, 5, 9, 150),
    ("Diclofenac 50mg", "Analgesics", "Cosmos Ltd", "tablet", True, 4, 6.5, 11, 100),
    ("Aspirin 75mg", "Analgesics", "Dawa Life", "tablet", False, 1.5, 2.5, 4, 200),
    ("Amoxicillin 250mg", "Antibiotics", "Cosmos Ltd", "capsule", True, 6, 9, 15, 120),
    ("Amoxiclav 625mg", "Antibiotics", "Elys Chemical", "tablet", True, 18, 26, 42, 60),
    ("Azithromycin 500mg", "Antibiotics", "Cosmos Ltd", "tablet", True, 25, 38, 60, 40),
    ("Ciprofloxacin 500mg", "Antibiotics", "Dawa Life", "tablet", True, 12, 18, 30, 60),
    ("Metronidazole 400mg", "Antibiotics", "GenPharm", "tablet", True, 3, 5, 8, 100),
    ("Artemether-Lumefantrine", "Antimalarials", "Elys Chemical", "pack", True, 120, 175, 280, 40),
    ("Sulfadoxine-Pyrimethamine", "Antimalarials", "Dawa Life", "tablet", True, 15, 22, 36, 50),
    ("Amlodipine 5mg", "Cardiovascular", "Cosmos Ltd", "tablet", True, 5, 8, 13, 80),
    ("Losartan 50mg", "Cardiovascular", "Elys Chemical", "tablet", True, 9, 14, 22, 60),
    ("Atorvastatin 20mg", "Cardiovascular", "GenPharm", "tablet", True, 11, 17, 27, 60),
    ("Metformin 500mg", "Diabetes Care", "Dawa Life", "tablet", True, 4, 6.5, 11, 100),
    ("Glibenclamide 5mg", "Diabetes Care", "Cosmos Ltd", "tablet", True, 3.5, 6, 10, 80),
    ("Insulin Glargine 100IU", "Diabetes Care", "NovaBio", "vial", True, 850, 1200, 1850, 15),
    ("Blood Glucose Test Strips", "Diabetes Care", "AccuCheck", "box", False, 900, 1250, 1900, 20),
    ("Vitamin C 500mg", "Vitamins & Supplements", "HealthPlus", "tablet", False, 2, 3.5, 6, 200),
    ("Multivitamin Syrup 200ml", "Vitamins & Supplements", "HealthPlus", "bottle", False, 180, 250, 390, 30),
    ("Ferrous Sulphate + Folic Acid", "Vitamins & Supplements", "Dawa Life", "tablet", False, 2.5, 4, 7, 150),
    ("Zinc Sulphate 20mg", "Vitamins & Supplements", "GenPharm", "tablet", False, 2, 3.5, 6, 120),
    ("Salbutamol Inhaler 100mcg", "Respiratory", "Elys Chemical", "unit", True, 320, 450, 700, 25),
    ("Cetirizine 10mg", "Respiratory", "GenPharm", "tablet", False, 3, 5, 8, 120),
    ("Cough Linctus 100ml", "Respiratory", "HealthPlus", "bottle", False, 110, 160, 250, 40),
    ("Hydrocortisone Cream 1%", "Dermatology", "Cosmos Ltd", "tube", False, 85, 125, 195, 30),
    ("Clotrimazole Cream 1%", "Dermatology", "Dawa Life", "tube", False, 95, 140, 215, 30),
    ("Povidone Iodine 60ml", "Dermatology", "Elys Chemical", "bottle", False, 120, 170, 265, 25),
    ("Sterile Gauze Swabs", "First Aid", "MediWrap", "pack", False, 60, 90, 145, 50),
    ("Adhesive Bandages", "First Aid", "MediWrap", "box", False, 140, 200, 310, 30),
    ("Surgical Spirit 100ml", "First Aid", "Elys Chemical", "bottle", False, 70, 105, 165, 40),
    ("Prenatal Vitamins", "Maternal & Child Health", "HealthPlus", "tablet", False, 6, 9, 15, 100),
    ("Paediatric Paracetamol Syrup", "Maternal & Child Health", "GenPharm", "bottle", False, 95, 140, 220, 40),
    ("ORS Sachets", "Maternal & Child Health", "Dawa Life", "pack", False, 18, 28, 45, 80),
]

SUPPLIERS = [
    ("MedSource Ltd", "Grace Wanjiku", "+254700112233", "orders@medsource.example", "Industrial Area, Nairobi"),
    ("Cosmos Pharmaceuticals", "Peter Otieno", "+254711223344", "sales@cosmos.example", "Mombasa Road, Nairobi"),
    ("Elys Chemical Industries", "Fatuma Ali", "+254722334455", "supply@elys.example", "Baba Dogo Rd, Nairobi"),
    ("Dawa Life Sciences", "Samuel Kiprono", "+254733445566", "info@dawalife.example", "Enterprise Rd, Nairobi"),
    ("HealthPlus Distributors", "Mary Njeri", "+254744556677", "orders@healthplus.example", "Westlands, Nairobi"),
]

RETAIL_CUSTOMERS = [
    "James Mwangi", "Aisha Hassan", "Daniel Ochieng", "Ruth Chebet", "Brian Kamau",
    "Lucy Atieno", "Kevin Njoroge", "Esther Wairimu", "Patrick Mutua", "Joyce Akinyi",
    "Michael Kariuki", "Sarah Nyambura",
]

WHOLESALE_CLIENTS = [
    ("Afya Clinic Pharmacy", 150000), ("Uzima Medical Centre", 200000),
    ("Tumaini Chemists", 80000), ("St. Monica Dispensary", 120000),
    ("Neema Healthcare Ltd", 250000), ("Baraka Pharmacy Chain", 300000),
]

DOCTORS = [
    "Dr. A. Mwende — Kenyatta Hospital", "Dr. J. Omondi — Nairobi West Clinic",
    "Dr. S. Karanja — Aga Khan", "Dr. L. Wafula — Mater Hospital",
    "Dr. P. Njuguna — Avenue Healthcare", "Dr. R. Achieng — Gertrude's",
]

PAYMENT_WEIGHTS = [("mpesa", 50), ("cash", 30), ("card", 12), ("credit", 8)]


class Command(BaseCommand):
    help = "Seed realistic demo data (catalogue, stock, sales, prescriptions). Does not touch users."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=90, help="Spread sales history over this many days (default 90).")
        parser.add_argument("--fresh", action="store_true", help="Delete existing non-user data first.")
        parser.add_argument("--tenant", type=str, help="Only seed this tenant slug.")
        parser.add_argument("--seed", type=int, default=42, help="RNG seed for reproducible data (default 42).")

    def handle(self, *args, **options):
        random.seed(options["seed"])
        tenants = Tenant.objects.all()
        if options["tenant"]:
            tenants = tenants.filter(slug=options["tenant"])
        if not tenants.exists():
            self.stderr.write(self.style.ERROR(
                "No tenants found. Run `python manage.py seed_demo` first to create tenants and logins."
            ))
            return

        for tenant in tenants:
            self.stdout.write(self.style.MIGRATE_HEADING(f"\nSeeding {tenant.name} ({tenant.tenant_type})…"))
            with tenant_context(tenant):
                if options["fresh"]:
                    self._wipe(tenant)
                self._seed_tenant(tenant, options["days"])

        self.stdout.write(self.style.SUCCESS("\nDone. Log in and check the dashboard and reports."))

    # ---------------------------------------------------------------- helpers

    def _wipe(self, tenant):
        """Remove business data for this tenant. Users and tenants are left alone."""
        for model in (
            SaleItem, Sale, PrescriptionItem, Prescription, StockMovement, Batch,
            PurchaseOrderItem, PurchaseOrder, Product, Category, Customer, Supplier, ActivityLog,
        ):
            # SaleItem/PrescriptionItem/PurchaseOrderItem aren't tenant-scoped
            # themselves (they hang off a tenant-scoped parent), so use the
            # unscoped manager and filter through the relation instead.
            if hasattr(model, "all_objects"):
                model.all_objects.filter(tenant=tenant).delete()
            elif model is SaleItem:
                model.objects.filter(sale__tenant=tenant).delete()
            elif model is PrescriptionItem:
                model.objects.filter(prescription__tenant=tenant).delete()
            elif model is PurchaseOrderItem:
                model.objects.filter(purchase_order__tenant=tenant).delete()
        self.stdout.write("  wiped existing data")

    def _pick_payment(self):
        pool = [m for m, w in PAYMENT_WEIGHTS for _ in range(w)]
        return random.choice(pool)

    def _price_field(self, tenant):
        return "wholesale_price" if tenant.tenant_type == Tenant.WHOLESALE else "retail_price"

    # ------------------------------------------------------------------ seed

    @transaction.atomic
    def _seed_tenant(self, tenant, days):
        today = timezone.now().date()

        categories = {}
        for name, desc in CATEGORIES:
            cat, _ = Category.objects.get_or_create(name=name, defaults={"description": desc})
            categories[name] = cat

        suppliers = []
        for name, contact, phone, email, address in SUPPLIERS:
            sup, _ = Supplier.objects.get_or_create(
                name=name,
                defaults={"contact_person": contact, "phone": phone, "email": email, "address": address},
            )
            suppliers.append(sup)
        self.stdout.write(f"  {len(categories)} categories, {len(suppliers)} suppliers")

        prefix = "WS" if tenant.tenant_type == Tenant.WHOLESALE else "RT"
        products = []
        for i, (name, cat, mfr, unit, rx, cost, ws, rt, reorder) in enumerate(PRODUCTS, start=1):
            sku = f"{prefix}-{i:04d}"
            product, _ = Product.objects.get_or_create(
                sku=sku,
                defaults=dict(
                    name=name, category=categories[cat], manufacturer=mfr, unit=unit,
                    requires_prescription=rx,
                    cost_price=Decimal(str(cost)), wholesale_price=Decimal(str(ws)),
                    retail_price=Decimal(str(rt)), reorder_level=reorder,
                    # Deterministic pseudo-EAN so barcode scanning is demoable.
                    barcode=f"60{tenant.id:02d}{i:09d}",
                ),
            )
            products.append(product)
        self.stdout.write(f"  {len(products)} products")

        # --- stock: a few batches per product, staggered expiries -----------
        # A deliberate slice gets near/past expiry dates so the expiring-soon
        # panel and the "expired stock as dead cost" report have real content.
        batch_count = 0
        for idx, product in enumerate(products):
            for b in range(random.randint(1, 3)):
                if idx % 11 == 0 and b == 0:
                    expiry = today - timedelta(days=random.randint(5, 60))      # already expired
                elif idx % 7 == 0 and b == 0:
                    expiry = today + timedelta(days=random.randint(5, 30))      # expiring soon
                else:
                    expiry = today + timedelta(days=random.randint(120, 900))
                qty = random.randint(40, 600) if product.cost_price < 100 else random.randint(5, 60)
                batch = Batch.objects.create(
                    product=product,
                    batch_number=f"B{random.randint(1000, 9999)}-{b + 1}",
                    expiry_date=expiry,
                    quantity=qty,
                    cost_price=product.cost_price,
                    supplier=random.choice(suppliers),
                )
                StockMovement.objects.create(
                    product=product, batch=batch, movement_type=StockMovement.IN,
                    quantity=qty, reason="Opening stock", reference="SEED",
                )
                batch_count += 1
        self.stdout.write(f"  {batch_count} batches")

        # --- customers -------------------------------------------------------
        customers = []
        if tenant.tenant_type == Tenant.WHOLESALE:
            for name, limit in WHOLESALE_CLIENTS:
                c, _ = Customer.objects.get_or_create(
                    name=name,
                    defaults={
                        "customer_type": Customer.WHOLESALE_CLIENT,
                        "credit_limit": Decimal(str(limit)),
                        "phone": f"+2547{random.randint(10000000, 99999999)}",
                    },
                )
                customers.append(c)
        else:
            for name in RETAIL_CUSTOMERS:
                c, _ = Customer.objects.get_or_create(
                    name=name,
                    defaults={
                        "customer_type": Customer.WALK_IN,
                        "phone": f"+2547{random.randint(10000000, 99999999)}",
                    },
                )
                customers.append(c)
        self.stdout.write(f"  {len(customers)} customers")

        # --- purchase orders -------------------------------------------------
        po_count = 0
        for _ in range(random.randint(6, 10)):
            supplier = random.choice(suppliers)
            status = random.choices(
                [PurchaseOrder.RECEIVED, PurchaseOrder.ORDERED, PurchaseOrder.DRAFT], weights=[6, 3, 2]
            )[0]
            po = PurchaseOrder.objects.create(
                supplier=supplier,
                status=status,
                expected_date=today + timedelta(days=random.randint(-30, 21)),
                notes=random.choice(["", "Urgent restock", "Monthly replenishment", "Backorder"]),
            )
            for product in random.sample(products, random.randint(2, 6)):
                PurchaseOrderItem.objects.create(
                    purchase_order=po, product=product,
                    quantity=random.randint(20, 300), unit_cost=product.cost_price,
                )
            po_count += 1
        self.stdout.write(f"  {po_count} purchase orders")

        # --- sales history ---------------------------------------------------
        price_field = self._price_field(tenant)
        sale_count = 0
        item_count = 0
        for day_offset in range(days, 0, -1):
            day = today - timedelta(days=day_offset)
            # Weekends are quieter; wholesale does fewer, larger orders.
            base = 2 if tenant.tenant_type == Tenant.WHOLESALE else 8
            if day.weekday() >= 5:
                base = max(1, base // 2)
            for _ in range(random.randint(max(1, base - 2), base + 3)):
                sale_items = []
                n_items = random.randint(1, 3) if tenant.tenant_type == Tenant.RETAIL else random.randint(3, 8)
                for product in random.sample(products, n_items):
                    available = sum(
                        b.quantity for b in Batch.objects.filter(product=product, quantity__gt=0)
                    )
                    if available <= 0:
                        continue
                    want = (
                        random.randint(1, 5) if tenant.tenant_type == Tenant.RETAIL
                        else random.randint(10, 60)
                    )
                    qty = min(want, available)
                    if qty > 0:
                        sale_items.append((product, qty))
                if not sale_items:
                    continue

                discount = Decimal("0")
                if random.random() < 0.15:
                    discount = Decimal(str(random.choice([20, 50, 100, 150])))

                sale = Sale.objects.create(
                    customer=random.choice(customers) if random.random() < 0.6 else None,
                    status=Sale.COMPLETED,
                    payment_method=self._pick_payment(),
                    discount=discount,
                    tax=Decimal("0"),
                )
                # created_at is auto_now_add, so backdate it explicitly to build
                # a real history rather than dumping everything on today.
                Sale.all_objects.filter(pk=sale.pk).update(
                    created_at=timezone.make_aware(
                        datetime.combine(day, time.min)
                        + timedelta(hours=random.randint(8, 18), minutes=random.randint(0, 59))
                    )
                )

                for product, qty in sale_items:
                    remaining = qty
                    first_batch = None
                    for batch in Batch.objects.filter(product=product, quantity__gt=0).order_by("expiry_date"):
                        if remaining <= 0:
                            break
                        take = min(batch.quantity, remaining)
                        batch.quantity -= take
                        batch.save(update_fields=["quantity"])
                        StockMovement.objects.create(
                            product=product, batch=batch, movement_type=StockMovement.OUT,
                            quantity=-take, reason="Sale", reference=f"Sale-{sale.id}",
                        )
                        if first_batch is None:
                            first_batch = batch
                        remaining -= take
                    SaleItem.objects.create(
                        sale=sale, product=product, batch=first_batch,
                        quantity=qty, unit_price=getattr(product, price_field),
                    )
                    item_count += 1
                sale_count += 1

        # A small number of voided sales so the void path shows up in reports.
        for sale in random.sample(list(Sale.objects.all()), max(1, sale_count // 40)):
            for movement in StockMovement.objects.filter(
                reference=f"Sale-{sale.id}", movement_type=StockMovement.OUT
            ):
                if movement.batch_id:
                    b = movement.batch
                    b.quantity -= movement.quantity
                    b.save(update_fields=["quantity"])
                StockMovement.objects.create(
                    product=movement.product, batch=movement.batch, movement_type=StockMovement.IN,
                    quantity=-movement.quantity, reason="Sale voided", reference=f"Sale-{sale.id}",
                )
            sale.status = Sale.VOID
            sale.save(update_fields=["status"])
        self.stdout.write(f"  {sale_count} sales ({item_count} line items) over {days} days")

        # --- prescriptions ---------------------------------------------------
        rx_products = [p for p in products if p.requires_prescription]
        rx_count = 0
        for day_offset in range(min(days, 60), 0, -1):
            if random.random() > 0.5:
                continue
            day = today - timedelta(days=day_offset)
            for _ in range(random.randint(1, 3)):
                chosen = random.sample(rx_products, random.randint(1, 3))
                dispensed = random.random() < 0.75
                rx = Prescription.objects.create(
                    customer=random.choice(customers),
                    prescribed_by=random.choice(DOCTORS),
                    notes=random.choice(["", "Complete the full course", "Take after meals", "Review in 2 weeks"]),
                    status=Prescription.DISPENSED if dispensed else Prescription.PENDING,
                )
                Prescription.all_objects.filter(pk=rx.pk).update(
                    created_at=timezone.make_aware(
                        datetime.combine(day, time.min)
                        + timedelta(hours=random.randint(9, 17))
                    )
                )
                for product in chosen:
                    PrescriptionItem.objects.create(
                        prescription=rx, product=product,
                        quantity=random.randint(1, 3) * 10,
                        dosage_instructions=random.choice([
                            "1 tablet twice daily", "1 tablet at night", "2 tablets 3x daily after food",
                            "1 capsule every 8 hours", "As directed",
                        ]),
                        dispensed=dispensed,
                    )
                rx_count += 1
        self.stdout.write(f"  {rx_count} prescriptions")

        # --- manual stock adjustments ---------------------------------------
        adj = 0
        for product in random.sample(products, 8):
            batch = Batch.objects.filter(product=product, quantity__gt=5).first()
            if not batch:
                continue
            delta = -random.randint(1, 5)
            batch.quantity += delta
            batch.save(update_fields=["quantity"])
            StockMovement.objects.create(
                product=product, batch=batch, movement_type=StockMovement.ADJUSTMENT,
                quantity=delta, reason=random.choice(["Breakage", "Stock count correction", "Damaged in transit"]),
                reference="ADJ",
            )
            adj += 1
        self.stdout.write(f"  {adj} stock adjustments")
