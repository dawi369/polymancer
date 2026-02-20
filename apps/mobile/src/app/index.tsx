import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/hooks/useAuth";

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
