import { useEffect } from "react";
import { useQuery } from "@apollo/client/react";
import {FITNESS_PROFILE, GET_ME} from "@/graphql/queries";
import { router } from "expo-router";

export function useEnsureFitnessProfile() {
    const { data: meData, loading: meLoading } = useQuery(GET_ME);
    // @ts-ignore
    const userId = meData?.user?._id;

    const skip = !userId; // skip until we have a user id

    const { data, loading, error } = useQuery(FITNESS_PROFILE, {
        variables: { userId },
        skip,
        fetchPolicy: "network-only", // don't rely on any older cache
    });

    useEffect(() => {
        if (skip || loading || meLoading) return;
        // @ts-ignore
        const noProfile = !data?.fitnessProfile?.profile;

        if (error || noProfile) {
            router.replace("/(onboarding)/onboard");
            return;
        }
    }, [skip, loading, data, error, meLoading]);

    return { loading };
}