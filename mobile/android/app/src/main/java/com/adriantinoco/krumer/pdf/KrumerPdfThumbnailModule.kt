package com.adriantinoco.krumer.pdf

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream
import kotlin.math.min
import kotlin.math.roundToInt

class KrumerPdfThumbnailModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName() = NAME

  @ReactMethod
  fun generate(filePath: String, pageIndex: Int, promise: Promise) {
    try {
      val descriptor = openDescriptor(filePath)
      if (descriptor == null) {
        promise.reject("PDF_NOT_FOUND", "Nao foi possivel abrir o PDF: $filePath")
        return
      }

      descriptor.use { opened ->
        PdfRenderer(opened).use { renderer ->
          if (pageIndex !in 0 until renderer.pageCount) {
            promise.reject(
              "PDF_INVALID_PAGE",
              "Pagina $pageIndex invalida. O PDF possui ${renderer.pageCount} paginas."
            )
            return
          }

          renderer.openPage(pageIndex).use { page ->
            val scale = min(MAX_WIDTH.toFloat() / page.width, MAX_HEIGHT.toFloat() / page.height)
            val width = (page.width * scale).roundToInt().coerceAtLeast(1)
            val height = (page.height * scale).roundToInt().coerceAtLeast(1)
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)

            try {
              bitmap.eraseColor(Color.WHITE)
              val transform = Matrix().apply { setScale(scale, scale) }
              page.render(bitmap, null, transform, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)

              val outputDirectory = File(reactApplicationContext.cacheDir, OUTPUT_DIRECTORY)
              if (!outputDirectory.exists() && !outputDirectory.mkdirs()) {
                throw IllegalStateException("Nao foi possivel criar o cache de capas")
              }

              val outputFile = File.createTempFile("krumer-cover-", ".jpg", outputDirectory)
              FileOutputStream(outputFile).use { stream ->
                if (!bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, stream)) {
                  throw IllegalStateException("Nao foi possivel salvar a capa do PDF")
                }
              }

              Log.i(TAG, "Thumbnail gerado em ${outputFile.absolutePath}")
              val result = Arguments.createMap().apply {
                putString("uri", Uri.fromFile(outputFile).toString())
                putInt("width", width)
                putInt("height", height)
              }
              promise.resolve(result)
            } finally {
              bitmap.recycle()
            }
          }
        }
      }
    } catch (error: Exception) {
      Log.w(TAG, "Falha ao gerar thumbnail do PDF: $filePath", error)
      promise.reject("PDF_RENDER_FAILED", error.message, error)
    }
  }

  private fun openDescriptor(filePath: String): ParcelFileDescriptor? {
    val uri = Uri.parse(filePath)
    return when (uri.scheme) {
      ContentResolver.SCHEME_CONTENT -> openContentDescriptor(uri)
      ContentResolver.SCHEME_FILE -> {
        val path = uri.path ?: return null
        ParcelFileDescriptor.open(File(path), ParcelFileDescriptor.MODE_READ_ONLY)
      }
      null ->
        ParcelFileDescriptor.open(File(filePath), ParcelFileDescriptor.MODE_READ_ONLY)
      else -> null
    }
  }

  private fun openContentDescriptor(uri: Uri): ParcelFileDescriptor? {
    try {
      val descriptor = reactApplicationContext.contentResolver.openFileDescriptor(uri, "r")
      if (descriptor != null) return descriptor
    } catch (error: Exception) {
      Log.w(TAG, "Nao foi possivel abrir $uri diretamente; copiando para o cache.", error)
    }

    // Fallback: copia o conteudo para um arquivo local antes de renderizar.
    return try {
      val input = reactApplicationContext.contentResolver.openInputStream(uri) ?: return null
      val cacheDir = File(reactApplicationContext.cacheDir, OUTPUT_DIRECTORY)
      if (!cacheDir.exists() && !cacheDir.mkdirs()) return null
      val copy = File.createTempFile("krumer-source-", ".pdf", cacheDir)
      input.use { source ->
        FileOutputStream(copy).use { out -> source.copyTo(out) }
      }
      Log.i(TAG, "PDF content:// copiado para ${copy.absolutePath}")
      ParcelFileDescriptor.open(copy, ParcelFileDescriptor.MODE_READ_ONLY)
    } catch (error: Exception) {
      Log.w(TAG, "Falha ao copiar content:// para o cache: $uri", error)
      null
    }
  }

  companion object {
    const val NAME = "KrumerPdfThumbnail"
    private const val TAG = "KrumerPdfThumbnail"
    private const val OUTPUT_DIRECTORY = "krumer-pdf-covers"
    private const val MAX_WIDTH = 900
    private const val MAX_HEIGHT = 1200
    private const val JPEG_QUALITY = 88
  }
}