use std::fmt::Debug;
use std::io;
use std::pin::Pin;
use std::sync::{Arc, OnceLock};
use std::task::{Context, Poll, ready};
use std::time::Duration;

use async_imap::Session;
use futures_util::StreamExt;
use futures_util::future::BoxFuture;
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};
use tokio::net::TcpStream;
use tokio_rustls::TlsConnector;
use tokio_rustls::rustls::pki_types::ServerName;
use tokio_rustls::rustls::{ClientConfig, RootCertStore};

pub const PORT: u16 = 993;
pub const MAX_MESSAGES: usize = 500;
const CONNECT: Duration = Duration::from_secs(20);
const WHOLE: Duration = Duration::from_secs(240);
const BATCH: usize = 40;
const MAILBOX: &str = "INBOX";
const RECENT_QUERY: &str = "(UID INTERNALDATE BODY.PEEK[]<0.65536>)";
const ORIGINAL_QUERY: &str = "(UID INTERNALDATE BODY.PEEK[]<0.262144>)";
const READ_ONLY: [&str; 7] = ["CAPABILITY", "LOGIN", "ID", "EXAMINE", "SEARCH", "NOOP", "LOGOUT"];

#[derive(Clone, PartialEq, Eq)]
pub struct Login {
    pub host: String,
    pub address: String,
    pub password: String,
}

impl Debug for Login {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Login")
            .field("host", &self.host)
            .field("address", &self.address)
            .finish_non_exhaustive()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum MailError {
    #[error("the server rejected the login")]
    BadLogin,
    #[error("the server refused the request")]
    Refused,
    #[error("the server could not be reached")]
    Unreachable,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Raw {
    pub uid: u32,
    pub at: Option<i64>,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Batch {
    pub validity: u32,
    pub total: u32,
    pub messages: Vec<Raw>,
}

pub trait MailSource: Debug + Send + Sync + 'static {
    fn probe(&self, login: Login, since: String) -> BoxFuture<'static, Result<u32, MailError>>;
    fn recent(
        &self,
        login: Login,
        since: String,
        after: Option<(u32, u32)>,
    ) -> BoxFuture<'static, Result<Batch, MailError>>;
    fn original(
        &self,
        login: Login,
        validity: u32,
        uid: u32,
    ) -> BoxFuture<'static, Result<Option<Raw>, MailError>>;
}

#[derive(Debug, Clone, Copy, Default)]
pub struct ImapMail;

fn tls() -> Arc<ClientConfig> {
    static CONFIG: OnceLock<Arc<ClientConfig>> = OnceLock::new();
    Arc::clone(CONFIG.get_or_init(|| {
        let mut roots = RootCertStore::empty();
        roots.add_parsable_certificates(webpki_root_certs::TLS_SERVER_ROOT_CERTS.iter().cloned());
        let provider = Arc::new(tokio_rustls::rustls::crypto::aws_lc_rs::default_provider());
        Arc::new(
            ClientConfig::builder_with_provider(provider)
                .with_safe_default_protocol_versions()
                .expect("the default TLS versions are supported")
                .with_root_certificates(roots)
                .with_no_client_auth(),
        )
    }))
}

async fn connect(host: &str) -> Result<tokio_rustls::client::TlsStream<TcpStream>, MailError> {
    let tcp = tokio::time::timeout(CONNECT, TcpStream::connect((host, PORT)))
        .await
        .map_err(|_| MailError::Unreachable)?
        .map_err(|_| MailError::Unreachable)?;
    let name = ServerName::try_from(host.to_owned()).map_err(|_| MailError::Unreachable)?;
    tokio::time::timeout(CONNECT, TlsConnector::from(tls()).connect(name, tcp))
        .await
        .map_err(|_| MailError::Unreachable)?
        .map_err(|_| MailError::Unreachable)
}

fn failed(error: &async_imap::error::Error) -> MailError {
    match error {
        async_imap::error::Error::No(_) | async_imap::error::Error::Bad(_) => MailError::Refused,
        _ => MailError::Unreachable,
    }
}

async fn open<S>(stream: S, login: &Login) -> Result<Session<Guarded<S>>, MailError>
where
    S: AsyncRead + AsyncWrite + Unpin + Debug + Send,
{
    let client = async_imap::Client::new(Guarded::new(stream));
    let mut session = client
        .login(&login.address, &login.password)
        .await
        .map_err(|(error, _)| match error {
            async_imap::error::Error::No(_) | async_imap::error::Error::Bad(_) | async_imap::error::Error::Validate(_) => {
                MailError::BadLogin
            }
            _ => MailError::Unreachable,
        })?;
    let _ = session
        .id([("name", Some("xiaoban")), ("version", Some(env!("CARGO_PKG_VERSION")))])
        .await;
    Ok(session)
}

async fn fetch<S>(session: &mut Session<Guarded<S>>, uids: &[u32], query: &str) -> Result<Vec<Raw>, MailError>
where
    S: AsyncRead + AsyncWrite + Unpin + Debug + Send,
{
    let set = uids.iter().map(u32::to_string).collect::<Vec<_>>().join(",");
    let mut found = Vec::new();
    let mut stream = session.uid_fetch(set, query).await.map_err(|error| failed(&error))?;
    while let Some(item) = stream.next().await {
        let item = item.map_err(|error| failed(&error))?;
        if let (Some(uid), Some(body)) = (item.uid, item.body()) {
            found.push(Raw {
                uid,
                at: item.internal_date().map(|date| date.timestamp_millis()),
                bytes: body.to_vec(),
            });
        }
    }
    Ok(found)
}

async fn search<S>(session: &mut Session<Guarded<S>>, since: &str) -> Result<(u32, Vec<u32>), MailError>
where
    S: AsyncRead + AsyncWrite + Unpin + Debug + Send,
{
    let mailbox = session.examine(MAILBOX).await.map_err(|error| failed(&error))?;
    let mut uids: Vec<u32> = session
        .uid_search(format!("SINCE {since}"))
        .await
        .map_err(|error| failed(&error))?
        .into_iter()
        .collect();
    uids.sort_unstable();
    Ok((mailbox.uid_validity.unwrap_or_default(), uids))
}

pub async fn probe_on<S>(stream: S, login: &Login, since: &str) -> Result<u32, MailError>
where
    S: AsyncRead + AsyncWrite + Unpin + Debug + Send,
{
    let mut session = open(stream, login).await?;
    let (_, uids) = search(&mut session, since).await?;
    if let Some(last) = uids.last() {
        fetch(&mut session, &[*last], RECENT_QUERY).await?;
    }
    let _ = session.logout().await;
    Ok(u32::try_from(uids.len()).unwrap_or(u32::MAX))
}

pub async fn recent_on<S>(
    stream: S,
    login: &Login,
    since: &str,
    after: Option<(u32, u32)>,
) -> Result<Batch, MailError>
where
    S: AsyncRead + AsyncWrite + Unpin + Debug + Send,
{
    let mut session = open(stream, login).await?;
    let (validity, uids) = search(&mut session, since).await?;
    let floor = after.filter(|(known, _)| *known == validity).map(|(_, uid)| uid);
    let fresh: Vec<u32> = uids
        .iter()
        .copied()
        .filter(|uid| floor.is_none_or(|floor| *uid > floor))
        .collect();
    let fresh = &fresh[fresh.len().saturating_sub(MAX_MESSAGES)..];
    let mut messages = Vec::new();
    for chunk in fresh.chunks(BATCH) {
        messages.extend(fetch(&mut session, chunk, RECENT_QUERY).await?);
    }
    let _ = session.logout().await;
    Ok(Batch {
        validity,
        total: u32::try_from(uids.len()).unwrap_or(u32::MAX),
        messages,
    })
}

pub async fn original_on<S>(stream: S, login: &Login, validity: u32, uid: u32) -> Result<Option<Raw>, MailError>
where
    S: AsyncRead + AsyncWrite + Unpin + Debug + Send,
{
    let mut session = open(stream, login).await?;
    let mailbox = session.examine(MAILBOX).await.map_err(|error| failed(&error))?;
    if mailbox.uid_validity.unwrap_or_default() != validity {
        let _ = session.logout().await;
        return Ok(None);
    }
    let found = fetch(&mut session, &[uid], ORIGINAL_QUERY).await?;
    let _ = session.logout().await;
    Ok(found.into_iter().next())
}

async fn bounded<T>(work: impl Future<Output = Result<T, MailError>>) -> Result<T, MailError> {
    tokio::time::timeout(WHOLE, work)
        .await
        .unwrap_or(Err(MailError::Unreachable))
}

impl MailSource for ImapMail {
    fn probe(&self, login: Login, since: String) -> BoxFuture<'static, Result<u32, MailError>> {
        Box::pin(bounded(async move {
            let stream = connect(&login.host).await?;
            probe_on(stream, &login, &since).await
        }))
    }

    fn recent(
        &self,
        login: Login,
        since: String,
        after: Option<(u32, u32)>,
    ) -> BoxFuture<'static, Result<Batch, MailError>> {
        Box::pin(bounded(async move {
            let stream = connect(&login.host).await?;
            recent_on(stream, &login, &since, after).await
        }))
    }

    fn original(
        &self,
        login: Login,
        validity: u32,
        uid: u32,
    ) -> BoxFuture<'static, Result<Option<Raw>, MailError>> {
        Box::pin(bounded(async move {
            let stream = connect(&login.host).await?;
            original_on(stream, &login, validity, uid).await
        }))
    }
}

fn is_tag(word: &str) -> bool {
    word.len() > 1 && word.starts_with('A') && word[1..].bytes().all(|byte| byte.is_ascii_digit())
}

fn peeks_only(line: &str) -> bool {
    let upper = line.to_ascii_uppercase();
    !upper.contains("BODY[")
        && !upper
            .split(|c: char| c.is_ascii_whitespace() || c == '(' || c == ')')
            .any(|word| word == "RFC822" || word == "RFC822.TEXT")
}

pub fn read_only(line: &[u8]) -> bool {
    let text = String::from_utf8_lossy(line);
    let mut words = text.split_ascii_whitespace();
    let Some(tag) = words.next() else {
        return true;
    };
    if !is_tag(tag) {
        return true;
    }
    let mut verb = words.next().unwrap_or_default().to_ascii_uppercase();
    if verb == "UID" {
        verb = words.next().unwrap_or_default().to_ascii_uppercase();
    }
    if verb == "FETCH" {
        return peeks_only(&text);
    }
    READ_ONLY.contains(&verb.as_str())
}

#[derive(Debug)]
pub struct Guarded<S> {
    inner: S,
    line: Vec<u8>,
    out: Vec<u8>,
}

impl<S> Guarded<S> {
    pub const fn new(inner: S) -> Self {
        Self {
            inner,
            line: Vec::new(),
            out: Vec::new(),
        }
    }
}

impl<S: AsyncWrite + Unpin> Guarded<S> {
    fn drain(&mut self, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        while !self.out.is_empty() {
            let written = ready!(Pin::new(&mut self.inner).poll_write(cx, &self.out))?;
            if written == 0 {
                return Poll::Ready(Err(io::ErrorKind::WriteZero.into()));
            }
            self.out.drain(..written);
        }
        Poll::Ready(Ok(()))
    }
}

impl<S: AsyncRead + Unpin> AsyncRead for Guarded<S> {
    fn poll_read(self: Pin<&mut Self>, cx: &mut Context<'_>, buf: &mut ReadBuf<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.get_mut().inner).poll_read(cx, buf)
    }
}

impl<S: AsyncWrite + Unpin> AsyncWrite for Guarded<S> {
    fn poll_write(self: Pin<&mut Self>, cx: &mut Context<'_>, buf: &[u8]) -> Poll<io::Result<usize>> {
        let this = self.get_mut();
        ready!(this.drain(cx))?;
        for &byte in buf {
            this.line.push(byte);
            if byte == b'\n' {
                if !read_only(&this.line) {
                    this.line.clear();
                    return Poll::Ready(Err(io::Error::new(
                        io::ErrorKind::PermissionDenied,
                        "only read-only mail commands are allowed",
                    )));
                }
                this.out.append(&mut this.line);
            }
        }
        Poll::Ready(Ok(buf.len()))
    }

    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        let this = self.get_mut();
        ready!(this.drain(cx))?;
        Pin::new(&mut this.inner).poll_flush(cx)
    }

    fn poll_shutdown(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        let this = self.get_mut();
        ready!(this.drain(cx))?;
        Pin::new(&mut this.inner).poll_shutdown(cx)
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use std::fmt::Write as _;
    use std::sync::Mutex;
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tokio::net::TcpListener;

    #[derive(Debug, Clone)]
    pub struct Message {
        pub uid: u32,
        pub raw: String,
    }

    #[derive(Debug, Default)]
    pub struct Server {
        pub commands: Mutex<Vec<String>>,
        pub seen: Mutex<Vec<u32>>,
    }

    async fn serve(listener: TcpListener, server: Arc<Server>, password: String, messages: Vec<Message>) {
        let (socket, _) = listener.accept().await.unwrap();
        let (read, mut write) = socket.into_split();
        let mut lines = BufReader::new(read).lines();
        write.write_all(b"* OK fake imap ready\r\n").await.unwrap();
        while let Ok(Some(line)) = lines.next_line().await {
            server.commands.lock().unwrap().push(line.clone());
            let mut words = line.splitn(3, ' ');
            let tag = words.next().unwrap_or_default().to_owned();
            let verb = words.next().unwrap_or_default().to_ascii_uppercase();
            let rest = words.next().unwrap_or_default().to_owned();
            let reply = match verb.as_str() {
                "LOGIN" if rest.ends_with(&format!("\"{password}\"")) => format!("{tag} OK logged in\r\n"),
                "LOGIN" => format!("{tag} NO [AUTHENTICATIONFAILED] invalid credentials\r\n"),
                "ID" => format!("* ID NIL\r\n{tag} OK ID done\r\n"),
                "EXAMINE" => format!(
                    "* {} EXISTS\r\n* 0 RECENT\r\n* OK [UIDVALIDITY 7] ok\r\n* FLAGS (\\Seen)\r\n{tag} OK [READ-ONLY] done\r\n",
                    messages.len()
                ),
                "SELECT" => format!("{tag} OK [READ-WRITE] done\r\n"),
                "UID" if rest.to_ascii_uppercase().starts_with("SEARCH") => {
                    let uids: Vec<String> = messages.iter().map(|message| message.uid.to_string()).collect();
                    format!("* SEARCH {}\r\n{tag} OK done\r\n", uids.join(" "))
                }
                "UID" if rest.to_ascii_uppercase().starts_with("FETCH") => {
                    let set = rest.split(' ').nth(1).unwrap_or_default();
                    let wanted: Vec<u32> = set.split(',').filter_map(|uid| uid.parse().ok()).collect();
                    let peek = rest.to_ascii_uppercase().contains("BODY.PEEK[");
                    let mut out = String::new();
                    for (index, message) in messages.iter().enumerate().filter(|(_, message)| wanted.contains(&message.uid)) {
                        if !peek {
                            server.seen.lock().unwrap().push(message.uid);
                        }
                        let _ = write!(
                            out,
                            "* {} FETCH (UID {} INTERNALDATE \"01-Nov-2026 08:00:00 +0800\" BODY[]<0> {{{}}}\r\n{})\r\n",
                            index + 1,
                            message.uid,
                            message.raw.len(),
                            message.raw
                        );
                    }
                    format!("{out}{tag} OK done\r\n")
                }
                "LOGOUT" => format!("* BYE\r\n{tag} OK bye\r\n"),
                _ => format!("{tag} BAD unknown\r\n"),
            };
            if write.write_all(reply.as_bytes()).await.is_err() || verb == "LOGOUT" {
                break;
            }
        }
    }

    pub async fn fake(password: &str, messages: Vec<Message>) -> (TcpStream, Arc<Server>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let server = Arc::new(Server::default());
        tokio::spawn(serve(listener, Arc::clone(&server), password.to_owned(), messages));
        (TcpStream::connect(addr).await.unwrap(), server)
    }

    pub fn login(password: &str) -> Login {
        Login {
            host: "127.0.0.1".into(),
            address: "me@example.com".into(),
            password: password.into(),
        }
    }

    fn mail(uid: u32, subject: &str) -> Message {
        Message {
            uid,
            raw: format!("From: shop@example.com\r\nSubject: {subject}\r\nContent-Type: text/plain\r\n\r\nhello {uid}\r\n"),
        }
    }

    #[tokio::test]
    async fn sync_uses_only_examine_search_and_peek() {
        let (stream, server) = fake("secret", vec![mail(3, "a"), mail(5, "b"), mail(9, "c")]).await;
        let batch = recent_on(stream, &login("secret"), "02-Oct-2026", Some((7, 3))).await.unwrap();
        assert_eq!(batch.validity, 7);
        assert_eq!(batch.total, 3);
        assert_eq!(batch.messages.iter().map(|raw| raw.uid).collect::<Vec<_>>(), vec![5, 9]);
        assert!(String::from_utf8_lossy(&batch.messages[0].bytes).contains("hello 5"));
        assert!(server.seen.lock().unwrap().is_empty());
        let commands = server.commands.lock().unwrap().clone();
        let verbs: Vec<String> = commands
            .iter()
            .map(|line| line.split(' ').skip(1).take(2).collect::<Vec<_>>().join(" ").to_ascii_uppercase())
            .collect();
        assert!(verbs.iter().any(|verb| verb.starts_with("EXAMINE")), "{commands:?}");
        assert!(!verbs.iter().any(|verb| verb.starts_with("SELECT")), "{commands:?}");
        for line in &commands {
            let upper = line.to_ascii_uppercase();
            for banned in ["STORE", "EXPUNGE", "MOVE", "COPY", "APPEND", "SELECT", "DELETE"] {
                assert!(!upper.split(' ').any(|word| word == banned), "{line}");
            }
            if upper.contains("FETCH") {
                assert!(upper.contains("BODY.PEEK["), "{line}");
                assert!(!upper.contains("BODY["), "{line}");
            }
        }
    }

    #[tokio::test]
    async fn a_wrong_password_is_reported_as_a_bad_login() {
        let (stream, server) = fake("secret", vec![mail(1, "a")]).await;
        assert_eq!(probe_on(stream, &login("wrong"), "02-Oct-2026").await, Err(MailError::BadLogin));
        assert!(!server.commands.lock().unwrap().iter().any(|line| line.contains("EXAMINE")));
    }

    #[tokio::test]
    async fn probing_reads_one_message_without_marking_it() {
        let (stream, server) = fake("secret", vec![mail(1, "a"), mail(2, "b")]).await;
        assert_eq!(probe_on(stream, &login("secret"), "02-Oct-2026").await, Ok(2));
        assert!(server.seen.lock().unwrap().is_empty());
        let fetches: Vec<String> = server.commands.lock().unwrap().iter().filter(|line| line.contains("FETCH")).cloned().collect();
        assert_eq!(fetches.len(), 1);
        assert!(fetches[0].contains(" 2 "), "{fetches:?}");
    }

    #[test]
    fn the_guard_rejects_anything_that_could_change_the_mailbox() {
        for line in [
            "A0003 EXAMINE INBOX\r\n",
            "A0004 UID SEARCH SINCE 02-Oct-2026\r\n",
            "A0005 UID FETCH 1,2 (UID BODY.PEEK[]<0.65536>)\r\n",
            "A0006 LOGOUT\r\n",
            "A0001 LOGIN \"me\" \"STORE\"\r\n",
        ] {
            assert!(read_only(line.as_bytes()), "{line}");
        }
        for line in [
            "A0003 SELECT INBOX\r\n",
            "A0004 UID STORE 1 +FLAGS (\\Seen)\r\n",
            "A0005 STORE 1 +FLAGS (\\Deleted)\r\n",
            "A0006 EXPUNGE\r\n",
            "A0007 UID MOVE 1 Trash\r\n",
            "A0008 APPEND INBOX {10}\r\n",
            "A0009 UID FETCH 1 (BODY[])\r\n",
            "A0010 FETCH 1 RFC822\r\n",
            "A0011 COPY 1 Archive\r\n",
        ] {
            assert!(!read_only(line.as_bytes()), "{line}");
        }
    }

    #[tokio::test]
    async fn the_guard_blocks_writes_before_they_reach_the_server() {
        let (stream, server) = fake("secret", vec![mail(1, "a")]).await;
        let mut session = open(stream, &login("secret")).await.unwrap();
        session.examine("INBOX").await.unwrap();
        assert!(session.uid_store("1", "+FLAGS (\\Seen)").await.is_err());
        assert!(session.select("INBOX").await.is_err());
        assert!(!server.commands.lock().unwrap().iter().any(|line| line.contains("STORE") || line.contains("SELECT")));
    }
}
