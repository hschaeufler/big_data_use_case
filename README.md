# Use Case: Impfpass

```json
{ 
	mission: 'sts-10', 
	timestamp: 1604325221 
}
```

## Initialize
It's recommended to that you give minikube a little more Memory. With the following commands you can allocate CPUs and Memory to the Kubernets cluster.
```
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

A running Hadoop cluster with YARN (for checkpointing)

```bash
helm repo add stable https://charts.helm.sh/stable
helm install --namespace=default --set hdfs.dataNode.replicas=1 --set yarn.nodeManager.replicas=1 --set hdfs.webhdfs.enabled=true my-hadoop-cluster stable/hadoop
```

## Deploy

To develop using [Skaffold](https://skaffold.dev/), use `skaffold dev`. 

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
### Helm
When you have problems with hadoop or kafka you can uninstall and install the operator again. To uninstall a release, you first need the name of it. With the following command you can list all releases in the current namespace. Then you can use the name to uninstall it.
```bash
helm list
helm delete my-hadoop-cluster
```
