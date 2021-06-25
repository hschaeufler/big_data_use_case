# Use Case: Impfpass
This is a digital Big-Data Vaccination Certificate-Prototype-App and an Examination performance. 

The Base of this Application was another Big-Data-Application implemented by our Big-Data-Professor Prof. Dr.-Ing. habil. Dennis Pfisterer.

Some Parts of his parts, are still present in this Readme and in the Code of this Application.

## Git Clone
This Project is using Git submodules. To clone the whole project please proceed as follows:

```
git clone https://github.com/hschaeufler/big_data_use_case.git
git submodule init
git submodule update
```
## Initialize
If you are running on Windows and have Hyper-V, we recommend to use Hyper-V as default driver:
```bash
minikube config set driver hyperv
```
It's recommended also that you give minikube a little more Memory. With the following commands you can allocate CPUs and Memory to the Kubernets cluster.
```bash
minikube config set memory 8192
minikube config set cpus 4
```
When you have already started kubernetes, you need to delete the current Cluster und restart it.
```
minikube delete
minikube start
```
Don't forget to enable the ingress plugin
```
minikube addons enable ingress
```
## Prerequisites

A running Strimzi.io Kafka operator

```bash
helm repo add strimzi http://strimzi.io/charts/
helm install my-kafka-operator strimzi/strimzi-kafka-operator
kubectl apply -f https://farberg.de/talks/big-data/code/helm-kafka-operator/kafka-cluster-def.yaml
```

Maybe you get the following Error
```bash
C:\workspaces\bigdata\big-data-use-case>helm install my-kafka-operator strimzi/strimzi-kafka-operator
Error: failed to download "strimzi/strimzi-kafka-operator" (hint: running `helm repo update` may help)
```
Then use ``helm repo update``

Instead of the old kafka-cluster-def.yaml you have to use an upgraded version:
```bash
kubectl apply -f helm-kafka-operator\kafka-cluster-def.yaml
```


A running Hadoop cluster with YARN (for checkpointing)

```bash
helm repo add stable https://charts.helm.sh/stable
helm install --namespace=default --set hdfs.dataNode.replicas=1 --set yarn.nodeManager.replicas=1 --set hdfs.webhdfs.enabled=true my-hadoop-cluster stable/hadoop
```

## Deploy

To develop using [Skaffold](https://skaffold.dev/), use `skaffold dev`. 

## Certificate

Because some Progressive Web App-Features like the Media Devices API (for getting Access to the Webcam)  requires a Secure Context (https), a self signed Certificate was used for the ingress. 
The following Parameters was used to sign this Certificate. It's valid for 10.000 days.

```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 10000 -nodes
```
## Open the App

For opening the App, please get the  IP adress if the Ingress using following coammand:
```bash
kubectl get ingress
```
Then you have to add the IP-Adress with the Hostname vac.book to your ``etc/host``-File. In Windows it's under following Location: ``C:\Windows\System32\drivers\etc``.

It should look like this. Please use the correct Ip-Adress.
```
# Vacbook
172.19.67.118 vac.book
```

Then you can open the App with following Adress in your Browser: [https://vac.book](https://vac.book)

## Troubleshooting

Maybe following Commands will help you, when you have Problems running the Use-Case.

Get a overview over the running pods and services:
```bash
kubectl get all
```

Get More Infos about a pod or service:
```bash
kubectl describe podname
```

Command for reading the Log-File
```bash
kubectl logs podname
```

Getting Cluster Events
```bash
kubectl get events
```

Get Endpoints for checking DNS-Errors
```bash
kubectl get endpoints
```
### Helm
When you have problems with hadoop or kafka you can uninstall and install the operator again. To uninstall a release, you first need the name of it. With the following command you can list all releases in the current namespace. Then you can use the name to uninstall it.
```bash
helm list
helm delete my-hadoop-cluster
```
### Mysql DB
Connect to  the MySQL-Databse with following command:
```bash
kubectl get pods
kubectl exec --stdin --tty [podname] -- /bin/bash
mysql -u root -p
```
### Docker
Build a Dockerfile in current directory (.) and tags it (-t container-name)
```
 docker build -t container-name .
```
Run the builded Container in detached mode (-d) and connect port (p 3000:3000)
```
 docker run -dp 3000:3000 container-name
```
Stop a running container container
```
docker stop container-name
```
Show all running container
```
docker ps
````

## Closing Note

Be careful when you use this App. It is a Prototype, not a Production-Ready Application. For example, we do not have any  Html and JavaScript-Sanitation.