from rest_framework.routers import DefaultRouter
from .views import CustomerViewSet, SaleViewSet, CashierShiftViewSet

router = DefaultRouter()
router.register(r"customers", CustomerViewSet, basename="customer")
router.register(r"sales", SaleViewSet, basename="sale")
router.register(r"shifts", CashierShiftViewSet, basename="shift")

urlpatterns = router.urls
