package com.fintrack.app.core.utils

import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction

/**
 * Decodifica o arquivo do extrato. Bancos brasileiros exportam ora UTF-8, ora Windows-1252 (acentos
 * "quebrados" se lidos como UTF-8): tenta UTF-8 estrito e, se falhar, usa Windows-1252.
 */
fun decodeStatement(bytes: ByteArray): String =
    try {
        Charsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)
            .decode(ByteBuffer.wrap(bytes))
            .toString()
    } catch (_: CharacterCodingException) {
        String(bytes, charset("windows-1252"))
    }
