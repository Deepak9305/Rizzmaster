package app.vercel.rizzmaster;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import androidx.activity.result.ActivityResult;
import com.codetrixstudio.capacitor.GoogleAuth.GoogleAuth;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.MockedStatic;

public class GoogleIdTokenTest {
    private static class TestPlugin extends GoogleAuth {
        void complete(PluginCall call) { signInResult(call, new ActivityResult(-1, null)); }
    }

    @Test
    public void returnsIdTokenWithoutWaitingForAccountManagerOrTokeninfo() throws Exception {
        GoogleSignInAccount account = mock(GoogleSignInAccount.class);
        when(account.getIdToken()).thenReturn("verified-by-supabase");
        Task<GoogleSignInAccount> task = mock(Task.class);
        when(task.getResult(ApiException.class)).thenReturn(account);
        PluginCall call = mock(PluginCall.class);
        when(call.getBoolean("skipAccessToken", false)).thenReturn(true);
        try (MockedStatic<GoogleSignIn> google = mockStatic(GoogleSignIn.class)) {
            google.when(() -> GoogleSignIn.getSignedInAccountFromIntent(any())).thenReturn(task);
            new TestPlugin().complete(call);
            ArgumentCaptor<JSObject> result = ArgumentCaptor.forClass(JSObject.class);
            verify(call).resolve(result.capture());
            assertEquals("verified-by-supabase", result.getValue().getJSObject("authentication").getString("idToken"));
            verify(account, never()).getAccount();
        }
    }

    @Test
    public void missingIdTokenRejectsWithoutStartingAccessTokenRetrieval() throws Exception {
        GoogleSignInAccount account = mock(GoogleSignInAccount.class);
        Task<GoogleSignInAccount> task = mock(Task.class);
        when(task.getResult(ApiException.class)).thenReturn(account);
        PluginCall call = mock(PluginCall.class);
        when(call.getBoolean("skipAccessToken", false)).thenReturn(true);
        try (MockedStatic<GoogleSignIn> google = mockStatic(GoogleSignIn.class)) {
            google.when(() -> GoogleSignIn.getSignedInAccountFromIntent(any())).thenReturn(task);
            new TestPlugin().complete(call);
            verify(call).reject(contains("did not return an ID token"));
            verify(call, never()).resolve(any(JSObject.class));
            verify(account, never()).getAccount();
        }
    }
}
