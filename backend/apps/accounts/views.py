"""HTTP endpoints of the identity and access context."""

from django.db import IntegrityError
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.serializers import DUPLICATE_EMAIL_MESSAGE, RegisterSerializer, UserSerializer
from apps.accounts.services import register_student


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
            # Two concurrent requests for the same email: the database constraint wins.
            raise serializers.ValidationError({"email": [DUPLICATE_EMAIL_MESSAGE]}) from error
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)
