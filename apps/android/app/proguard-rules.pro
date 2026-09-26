# kotlinx.serialization: mantém os serializers gerados dos DTOs da API.
-keepattributes *Annotation*, InnerClasses, Signature, Exceptions
-keepclassmembers @kotlinx.serialization.Serializable class com.fintrack.app.** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.fintrack.app.data.models.**$$serializer { *; }

# Retrofit: interfaces de API usadas via reflexão.
-keep,allowobfuscation interface com.fintrack.app.data.api.**
