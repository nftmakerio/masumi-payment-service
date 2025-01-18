# Deployment Guide

You can deploy it to any cloud service which can handle docker images.

Popular services are [AWS](https://aws.amazon.com/), [GCP](https://cloud.google.com/), [Azure](https://azure.microsoft.com/) or
[Digital Ocean](https://www.digitalocean.com/)

We recommend also using a PostgreSQL database service and do backups of the database and especially wallet data.

## Run with Docker

1. Create the `.env` file with the correct values or inject the values to docker (migrate the database and
   optionally seed it first)
2. Build:

   ```
   docker build -t masumi-payment-service .
   ```

3. Run
   ```
   docker run -d -p 3001:3001 masumi-payment-service
   ```
   Replacing `masumi-payment-service` with the image name, and `3001:3001` with the `host:container` ports to
   publish.

Otherwise you can run the project locally by following the Quickstart guide in the [README](../README.md)
