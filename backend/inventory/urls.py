from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet, ProductViewSet, BatchViewSet, StockMovementViewSet

router = DefaultRouter()
router.register(r"categories", CategoryViewSet, basename="category")
router.register(r"products", ProductViewSet, basename="product")
router.register(r"batches", BatchViewSet, basename="batch")
router.register(r"stock-movements", StockMovementViewSet, basename="stock-movement")

urlpatterns = router.urls
