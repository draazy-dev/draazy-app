FROM eclipse-temurin:25-jdk AS build

WORKDIR /build

# unzip stops mvnw falling back to GNU tar, whose openat2() fails under amd64 emulation.
RUN apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/*

COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
# Explicit buildDirName: .mvn/maven.config pins target-cli, and a wrong guess leaves the jar COPY matching nothing.
RUN chmod +x mvnw && ./mvnw -B -DbuildDirName=target dependency:go-offline

COPY src/ src/

RUN ./mvnw -B -DbuildDirName=target -DskipTests package

FROM eclipse-temurin:25-jre AS runtime

RUN groupadd --system app && useradd --system --gid app --no-create-home app

WORKDIR /app
COPY --from=build --chown=root:root /build/target/*.jar /app/app.jar
USER app

# Baked so a deploy that forgets the profile cannot boot healthy on the insecure developer defaults.
ENV SPRING_PROFILES_ACTIVE=prod

# Non-heap runs ~290 MB, so heap plus these caps must stay under the container limit or the kernel kills the JVM.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=50.0 -XX:MaxMetaspaceSize=192m -XX:ReservedCodeCacheSize=128m -XX:+ExitOnOutOfMemoryError"

EXPOSE 8080

# exec form keeps the JVM as PID 1 so SIGTERM reaches it and in-flight requests drain.
# webp-imageio loads libwebp through JNI, which newer JDKs deny unless native access is granted.
ENTRYPOINT ["java", "--enable-native-access=ALL-UNNAMED", "-jar", "/app/app.jar"]
