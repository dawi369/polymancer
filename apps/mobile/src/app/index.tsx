import { useAuth } from "@/src/hooks/useAuth";
import { useRouter } from "expo-router";
import { useEffect } from "react";

export default function Index() {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.replace("/(home)");
      } else {
        router.replace("/(login)");
      }
    }
  }, [isLoading, isAuthenticated, router]);

  return null;
}
