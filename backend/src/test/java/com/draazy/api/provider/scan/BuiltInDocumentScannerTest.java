package com.draazy.api.provider.scan;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.provider.DocumentScanner.Verdict;
import com.draazy.api.provider.DocumentScanner.Verdict.Outcome;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Built-in document scanner — structural checks (tech-debt D131)")
class BuiltInDocumentScannerTest {
    private static final long TEN_MB = 10L * 1024 * 1024;

    private final BuiltInDocumentScanner scanner = new BuiltInDocumentScanner(TEN_MB);

    private static final String PDF = "application/pdf";
    private static final String PNG = "image/png";

    private static byte[] ascii(String s) {
        return s.getBytes(StandardCharsets.US_ASCII);
    }

    private static byte[] bytes(int... unsigned) {
        byte[] out = new byte[unsigned.length];
        for (int i = 0; i < unsigned.length; i++) {
            out[i] = (byte) unsigned[i];
        }
        return out;
    }

    private static byte[] pngBytes() {
        return bytes(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0);
    }

    @Test
    @DisplayName("a real PDF with a matching name is stored")
    void acceptsAnHonestDocument() {
        assertThat(scanner.scan("deed.pdf", PDF, ascii("%PDF-1.7 sale deed")).isClean()).isTrue();
        assertThat(scanner.scan("scan.png", PNG, pngBytes()).isClean()).isTrue();
    }

    @Test
    @DisplayName("an oversized file is 413, not 415 — the uploader can fix it")
    void refusesAnOversizedFileAsTooLarge() {
        var small = new BuiltInDocumentScanner(1024);
        byte[] payload = new byte[1025];
        System.arraycopy(ascii("%PDF-1.7"), 0, payload, 0, 8);

        Verdict verdict = small.scan("deed.pdf", PDF, payload);

        assertThat(verdict.outcome()).isEqualTo(Outcome.TOO_LARGE);
        assertThat(verdict.detail()).contains("too large");
    }

    @Test
    @DisplayName("an empty upload is refused rather than stored as a zero-byte document")
    void refusesAnEmptyFile() {
        assertThat(scanner.scan("deed.pdf", PDF, new byte[0]).outcome()).isEqualTo(Outcome.REJECTED);
        assertThat(scanner.scan("deed.pdf", PDF, null).outcome()).isEqualTo(Outcome.REJECTED);
    }

    @Test
    @DisplayName("a real PDF named .exe is refused — the bytes are fine, the name is the attack")
    void refusesADangerousExtensionEvenOnGenuineContent() {
        Verdict verdict = scanner.scan("deed.pdf.exe", PDF, ascii("%PDF-1.7 sale deed"));

        assertThat(verdict.outcome()).isEqualTo(Outcome.REJECTED);
        assertThat(verdict.detail()).contains(".exe");
    }

    @Test
    @DisplayName("only the last extension counts, because that is the only one an OS reads")
    void readsOnlyTheFinalExtension() {
        assertThat(scanner.scan("deed.exe.pdf", PDF, ascii("%PDF-1.7")).isClean()).isTrue();
    }

    @Test
    @DisplayName("a PDF named .jpg is refused: the recipient's computer would open it wrongly")
    void refusesAKnownExtensionThatContradictsTheProvedType() {
        Verdict verdict = scanner.scan("deed.jpg", PDF, ascii("%PDF-1.7"));

        assertThat(verdict.outcome()).isEqualTo(Outcome.REJECTED);
        assertThat(verdict.detail()).contains(".jpg").contains(PDF);
    }

    @Test
    @DisplayName("jpg, JPEG and jpe are one type; heif and heic are another")
    void treatsAlternativeSpellingsOfATypeAsOneType() {
        byte[] jpeg = bytes(0xFF, 0xD8, 0xFF, 0xE0);

        assertThat(scanner.scan("scan.jpg", "image/jpeg", jpeg).isClean()).isTrue();
        assertThat(scanner.scan("scan.JPEG", "image/jpeg", jpeg).isClean()).isTrue();
        assertThat(scanner.scan("scan.jpe", "image/jpeg", jpeg).isClean()).isTrue();
        assertThat(scanner.scan("photo.HEIF", "image/heic", jpeg).isClean()).isTrue();

        assertThat(scanner.scan("photo.heif", "image/jpeg", jpeg).outcome())
                .isEqualTo(Outcome.REJECTED);
    }

    @Test
    @DisplayName("an absent or unfamiliar extension is not held against an honest file")
    void leavesUnknownExtensionsAlone() {
        assertThat(scanner.scan("deed", PDF, ascii("%PDF-1.7")).isClean()).isTrue();
        assertThat(scanner.scan("deed.2024-04-11", PDF, ascii("%PDF-1.7")).isClean()).isTrue();
        assertThat(scanner.scan(null, PDF, ascii("%PDF-1.7")).isClean()).isTrue();
    }

    @Test
    @DisplayName("executables and archives are named in the refusal, not just rejected")
    void refusesContainersThatExecuteOrHideFurtherFiles() {
        assertThat(scanner.scan("x.pdf", PDF, bytes('M', 'Z', 0x90, 0x00)).detail())
                .contains("a Windows program");
        assertThat(scanner.scan("x.pdf", PDF, bytes(0x7F, 'E', 'L', 'F')).detail())
                .contains("a Linux program");
        assertThat(scanner.scan("x.pdf", PDF, bytes('P', 'K', 0x03, 0x04)).detail())
                .contains("an archive");
        assertThat(scanner.scan("x.pdf", PDF, bytes(0x1F, 0x8B, 0x08, 0x00)).detail())
                .contains("a compressed file");
    }

    @Test
    @DisplayName("HTML and SVG are refused even behind a BOM or leading whitespace")
    void refusesMarkupHiddenBehindLeadingBlanks() {
        assertThat(scanner.scan("x.png", PNG, ascii("\n\n  <svg xmlns=...>")).detail())
                .contains("an SVG image");
        assertThat(scanner.scan("x.png", PNG, ascii("  <!DOCTYPE html>")).detail())
                .contains("a web page");

        byte[] markup = ascii("<html><script>alert(1)</script>");
        byte[] withBom = new byte[markup.length + 3];
        System.arraycopy(bytes(0xEF, 0xBB, 0xBF), 0, withBom, 0, 3);
        System.arraycopy(markup, 0, withBom, 3, markup.length);
        assertThat(scanner.scan("x.png", PNG, withBom).detail()).contains("a web page");
    }

    @Test
    @DisplayName("a PDF that runs JavaScript or launches a program is refused")
    void refusesPdfActiveContent() {
        assertThat(scanner.scan("deed.pdf", PDF,
                ascii("%PDF-1.7\n/Type/Action/S/JavaScript(app.alert(1))")).detail())
                .contains("runs JavaScript");
        assertThat(scanner.scan("deed.pdf", PDF, ascii("%PDF-1.7\n/S/Launch/F(cmd.exe)")).detail())
                .contains("can launch a program");
    }

    @Test
    @DisplayName("the short spellings /JS and /AA are deliberately not matched")
    void doesNotMatchSpellingsShortEnoughToOccurByChance() {
        assertThat(scanner.scan("deed.pdf", PDF, ascii("%PDF-1.7 stream /JS /AA endstream"))
                .isClean()).isTrue();
    }

    @Test
    @DisplayName("only PDFs are searched for PDF active content")
    void doesNotApplyThePdfCheckToImages() {
        byte[] png = pngBytes();
        byte[] withText = new byte[png.length + 11];
        System.arraycopy(png, 0, withText, 0, png.length);
        System.arraycopy(ascii("/JavaScript"), 0, withText, png.length, 11);

        assertThat(scanner.scan("scan.png", PNG, withText).isClean()).isTrue();
    }
}
