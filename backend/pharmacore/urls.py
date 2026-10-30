from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("accounts.urls")),
    path("api/", include("tenants.urls")),
    path("api/", include("core.urls")),
    path("api/", include("inventory.urls")),
    path("api/", include("sales.urls")),
    path("api/", include("purchasing.urls")),
    path("api/", include("prescriptions.urls")),
    path("api/", include("reports.urls")),
]
