package app.vercel.rizzmaster;

import static org.junit.Assert.*;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class RizzCardExportTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();
    private final byte[] png = {(byte) 137, 80, 78, 71, 13, 10, 26, 10, 1};

    @Test public void acceptsOnlyPngFilesInTheFeatureCacheFolder() throws Exception {
        File cache = temporary.newFolder("cache");
        File folder = new File(cache, "rizz-share");
        assertTrue(folder.mkdir());
        File card = new File(folder, "rizzmaster-123-card.png");
        Files.write(card.toPath(), png);
        assertEquals(card.getCanonicalFile(), RizzCardExportPlugin.resolveSource(cache, card.toURI().toString()));
        File privateFile = new File(cache, "rizzmaster-private.png");
        Files.write(privateFile.toPath(), png);
        assertThrows(IOException.class, () -> RizzCardExportPlugin.resolveSource(cache, privateFile.toURI().toString()));
        assertThrows(IOException.class, () -> RizzCardExportPlugin.resolveSource(cache, "https://example.com/card.png"));
        assertThrows(IOException.class, () -> RizzCardExportPlugin.resolveSource(cache, "content://other-app/private"));
    }

    @Test public void rejectsMissingFilesAndFakePngs() throws Exception {
        File cache = temporary.newFolder("cache");
        File folder = new File(cache, "rizz-share");
        assertTrue(folder.mkdir());
        File fake = new File(folder, "rizzmaster-fake.png");
        Files.write(fake.toPath(), "not-a-png-file".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertThrows(IOException.class, () -> RizzCardExportPlugin.resolveSource(cache, fake.toURI().toString()));
        File missing = new File(folder, "rizzmaster-missing.png");
        assertThrows(IOException.class, () -> RizzCardExportPlugin.resolveSource(cache, missing.toURI().toString()));
    }
}
