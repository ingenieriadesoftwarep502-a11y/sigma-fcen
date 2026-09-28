"""HTTP endpoints of the identity and access context."""

from typing import cast

from django.contrib.auth import authenticate
from django.db import IntegrityError
from django.middleware.csrf import get_token
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import generics, serializers, status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.authentication import (
    REFRESH_COOKIE,
    clear_token_cookies,
    enforce_csrf,
    set_token_cookies,
)
from apps.accounts.models import User
from apps.accounts.serializers import (
    DUPLICATE_EMAIL_MESSAGE,
    AdminUserSerializer,
    LoginSerializer,
    RegisterSerializer,
    RoleAssignmentSerializer,
    UserCreateSerializer,
    UserSerializer,
    UserUpdateSerializer,
)
from apps.accounts.services import create_user, register_student, set_roles, update_user
from shared.permissions import IsAdmin

# Same message for unknown email, wrong password and inactive account: no account enumeration.
INVALID_CREDENTIALS_MESSAGE = "Correo o contraseña incorrectos."
INVALID_SESSION_MESSAGE = "La sesión no es válida o expiró."


def _unauthorized(detail: str) -> Response:
    return Response({"detail": detail}, status=status.HTTP_401_UNAUTHORIZED)


class RegisterView(APIView):
    """Public self-registration with an institutional email (HU-01)."""

    permission_classes = (AllowAny,)
    authentication_classes = ()

    @extend_schema(request=RegisterSerializer, responses={201: UserSerializer})
    def post(self, request: Request) -> Response:
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user = register_student(**serializer.validated_data)
        except IntegrityError as error:
            raise _duplicate_email(error) from error
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    """Issues the access and refresh tokens as HttpOnly cookies (ADR-007)."""

    permission_classes = (AllowAny,)
    authentication_classes = ()

    @extend_schema(
        request=LoginSerializer,
        responses={200: UserSerializer, 401: OpenApiResponse(description="Invalid credentials")},
    )
    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # ModelBackend also rejects inactive accounts (RN-002.4).
        user = authenticate(
            request._request,
            email=serializer.validated_data["email"],
            password=serializer.validated_data["password"],
        )
        if user is None:
            return _unauthorized(INVALID_CREDENTIALS_MESSAGE)
        refresh = RefreshToken.for_user(user)
        response = Response(UserSerializer(user).data)
        set_token_cookies(response, access=str(refresh.access_token), refresh=str(refresh))
        # Makes CsrfViewMiddleware send the csrftoken cookie the frontend echoes back.
        get_token(request._request)
        return response


class RefreshView(APIView):
    """Issues a new access cookie from the refresh cookie, even if the access token expired."""

    permission_classes = (AllowAny,)
    authentication_classes = ()

    @extend_schema(
        request=None,
        responses={200: None, 401: OpenApiResponse(description="Missing or invalid session")},
    )
    def post(self, request: Request) -> Response:
        enforce_csrf(request)
        raw_refresh = request.COOKIES.get(REFRESH_COOKIE)
        if not raw_refresh:
            return _unauthorized(INVALID_SESSION_MESSAGE)
        serializer = TokenRefreshSerializer(data={"refresh": raw_refresh})
        try:
            # Also rejects refresh tokens of deactivated users (CA-HU11-2).
            serializer.is_valid(raise_exception=True)
        except (TokenError, AuthenticationFailed):
            return _unauthorized(INVALID_SESSION_MESSAGE)
        response = Response(status=status.HTTP_200_OK)
        set_token_cookies(response, access=serializer.validated_data["access"])
        return response


class LogoutView(APIView):
    @extend_schema(request=None, responses={204: None})
    def post(self, request: Request) -> Response:
        response = Response(status=status.HTTP_204_NO_CONTENT)
        clear_token_cookies(response)
        return response


class MeView(APIView):
    """The authenticated user's own identity and roles (CA-HU01-5)."""

    @extend_schema(responses={200: UserSerializer})
    def get(self, request: Request) -> Response:
        # IsAuthenticated (the default permission) guarantees a real user here.
        return Response(UserSerializer(cast(User, request.user)).data)


def _duplicate_email(error: IntegrityError) -> serializers.ValidationError:
    # Two concurrent requests for the same email: the database constraint wins.
    return serializers.ValidationError({"email": [DUPLICATE_EMAIL_MESSAGE]})


class UserListCreateView(generics.ListAPIView[User]):
    """Administrators list every account and create new ones with roles (RF-020, RF-021)."""

    permission_classes = (IsAdmin,)
    queryset = User.objects.prefetch_related("roles").order_by("email")
    serializer_class = AdminUserSerializer

    @extend_schema(request=UserCreateSerializer, responses={201: AdminUserSerializer})
    def post(self, request: Request) -> Response:
        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user = create_user(actor=cast(User, request.user), **serializer.validated_data)
        except IntegrityError as error:
            raise _duplicate_email(error) from error
        return Response(AdminUserSerializer(user).data, status=status.HTTP_201_CREATED)


class UserDetailView(generics.RetrieveAPIView[User]):
    """Administrators read and edit one account; PUT is not offered."""

    permission_classes = (IsAdmin,)
    queryset = User.objects.all()
    serializer_class = AdminUserSerializer

    @extend_schema(request=UserUpdateSerializer, responses={200: AdminUserSerializer})
    def patch(self, request: Request, pk: str) -> Response:
        user = self.get_object()
        serializer = UserUpdateSerializer(data=request.data, context={"user": user})
        serializer.is_valid(raise_exception=True)
        try:
            update_user(actor=cast(User, request.user), user=user, data=serializer.validated_data)
        except IntegrityError as error:
            raise _duplicate_email(error) from error
        return Response(AdminUserSerializer(user).data)


class UserRolesView(generics.GenericAPIView[User]):
    """Replaces the roles of one account (RF-021)."""

    permission_classes = (IsAdmin,)
    queryset = User.objects.all()
    serializer_class = RoleAssignmentSerializer

    @extend_schema(request=RoleAssignmentSerializer, responses={200: AdminUserSerializer})
    def post(self, request: Request, pk: str) -> Response:
        user = self.get_object()
        serializer = RoleAssignmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        set_roles(
            actor=cast(User, request.user), user=user, roles=serializer.validated_data["roles"]
        )
        return Response(AdminUserSerializer(user).data)
