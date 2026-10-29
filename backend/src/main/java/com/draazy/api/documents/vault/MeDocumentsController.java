package com.draazy.api.documents.vault;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class MeDocumentsController {
    private final DocumentService documentService;

    public MeDocumentsController(DocumentService documentService) {
        this.documentService = documentService;
    }

    @GetMapping(Routes.MeDocuments.FOR_PROPERTY)
    public List<DocumentSummary> listDocuments(@CurrentUser AuthPrincipal principal,
            @PathVariable("propId") String propId) {
        return documentService.list(principal.userId(), propId);
    }

    @PostMapping(value = Routes.MeDocuments.FOR_PROPERTY, consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public DocumentSummary uploadDocument(@CurrentUser AuthPrincipal principal,
            @PathVariable("propId") String propId,
            @RequestParam("category") String category,
            @RequestParam("file") MultipartFile file) {
        return documentService.upload(principal.userId(), propId, category, file);
    }

    @GetMapping(Routes.MeDocuments.URL)
    public DocumentUrl documentUrl(@CurrentUser AuthPrincipal principal,
            @PathVariable("docId") String docId) {
        return documentService.url(principal.userId(), docId);
    }

    @DeleteMapping(Routes.MeDocuments.BY_ID)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteDocument(@CurrentUser AuthPrincipal principal,
            @PathVariable("propId") String propId, @PathVariable("docId") String docId) {
        documentService.delete(principal, propId, docId);
    }

    @GetMapping(Routes.MeDocuments.PERSONAL)
    public List<DocumentSummary> listPersonalDocuments(@CurrentUser AuthPrincipal principal) {
        return documentService.listPersonal(principal.userId());
    }

    @PostMapping(value = Routes.MeDocuments.PERSONAL, consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public DocumentSummary uploadPersonalDocument(@CurrentUser AuthPrincipal principal,
            @RequestParam("category") String category,
            @RequestParam("file") MultipartFile file) {
        return documentService.uploadPersonal(principal.userId(), category, file);
    }

    @DeleteMapping(Routes.MeDocuments.PERSONAL_BY_ID)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deletePersonalDocument(@CurrentUser AuthPrincipal principal,
            @PathVariable("docId") String docId) {
        documentService.deletePersonal(principal.userId(), docId);
    }

    @GetMapping(Routes.MeDocuments.FOR_MANAGED)
    public List<DocumentSummary> listManagedDocuments(@CurrentUser AuthPrincipal principal,
            @PathVariable("managedId") String managedId) {
        return documentService.listManaged(principal.userId(), managedId);
    }

    @PostMapping(value = Routes.MeDocuments.FOR_MANAGED,
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public DocumentSummary uploadManagedDocument(@CurrentUser AuthPrincipal principal,
            @PathVariable("managedId") String managedId,
            @RequestParam("category") String category,
            @RequestParam("file") MultipartFile file) {
        return documentService.uploadManaged(principal.userId(), managedId, category, file);
    }

    @DeleteMapping(Routes.MeDocuments.MANAGED_BY_ID)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteManagedDocument(@CurrentUser AuthPrincipal principal,
            @PathVariable("managedId") String managedId, @PathVariable("docId") String docId) {
        documentService.deleteManaged(principal.userId(), managedId, docId);
    }
}
