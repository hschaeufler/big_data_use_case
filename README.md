# Use Case: Popular NASA Shuttle Missions

```json
{ 
	mission: 'sts-10', 
	timestamp: 1604325221 
}
```

## Prerequisites

A running Strimzi.io Kafka operator

```bash
helm repo add strimzi http://strimzi.io/charts/
helm install my-kafka-operator strimzi/strimzi-kafka-operator

helm install my-kafka-operator strimzi/strimzi-kafka-operator --version v0.22.0
kubectl apply -f https://farberg.de/talks/big-data/code/helm-kafka-operator/kafka-cluster-def.yaml
```

A running Hadoop cluster with YARN (for checkpointing)

```bash
helm repo add stable https://charts.helm.sh/stable
helm install --namespace=default --set hdfs.dataNode.replicas=1 --set yarn.nodeManager.replicas=1 --set hdfs.webhdfs.enabled=true my-hadoop-cluster stable/hadoop
```

## Deploy

To develop using [Skaffold](https://skaffold.dev/), use `skaffold dev`. 


sql:
restart
kubectl rollout restart deployment mysql-deployment -n default
### Mysql DB
kubectl get pods
kubectl exec --stdin --tty [podname] -- /bin/bash
mysql -u root -p
SHOW DATABASES;  			; <- !
use popular;
Select * from popularlocs ORDER BY count;


kubectl describe podname 
kubectl get all
kubectl logs podname
kubectl port-forward service/popular-slides-service 3000:3000
kubectl get endpoints

minikube delete
minikube start
minikube addons enable ingress


Hadoop:
 helm delete my-hadoop-cluster


restart popular slides:
kubectl rollout restart deployment popular-slides-spark -n default


cd C:\Users\Noel\Repos\BigData3