FROM rust:1-slim AS build
WORKDIR /src
COPY . .
RUN cargo build --release -p xiaoban-relay

FROM gcr.io/distroless/cc-debian12
COPY --from=build /src/target/release/xiaoban-relay /usr/local/bin/xiaoban-relay
EXPOSE 8443
ENTRYPOINT ["/usr/local/bin/xiaoban-relay"]
