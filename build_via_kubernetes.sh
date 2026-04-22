# 1. Build the image into containerd's k8s namespace
nerdctl --namespace k8s.io build -t code-weaver:latest .

# 2. Deploy to Kubernetes
kubectl apply -f app-deployment.yaml -f app-service.yaml

# 3. (To access the app) port-forward to localhost
kubectl port-forward svc/app 948:948
# Then open http://localhost:948
