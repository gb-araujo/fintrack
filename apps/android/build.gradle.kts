// AGP 9 tem suporte a Kotlin embutido: o plugin org.jetbrains.kotlin.android não é aplicado.
// Os plugins Kotlin abaixo (compose/serialization) fixam a versão do Kotlin usada no build.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
}
