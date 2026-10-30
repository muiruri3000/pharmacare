from rest_framework.routers import DefaultRouter
from .views import CustomerViewSet, SaleViewSet

router = DefaultRouter()
router.register(r"customers", CustomerViewSet, basename="customer")
router.register(r"sales", SaleViewSet, basename="sale")

urlpatterns = router.urls
