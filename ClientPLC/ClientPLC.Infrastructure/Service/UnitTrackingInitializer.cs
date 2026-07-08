using System;
using System.Collections.Generic;
using System.Linq;
using PLC.Config;
using PLC.Model;
using PLC.Network;
using PLC.Service;

namespace PLC.Infrastructure.Service;

public static class UnitTrackingInitializer
{
    public static void Initialize()
    {
        UnitTrackingService.Instance.SetCompletionCallback(OnUnitCompleted);
        MqttClientService.OnPlcDataRead += OnPlcDataRead;
    }

    private static void OnUnitCompleted(UnitRecord unit)
    {
        LocalDbService.Instance.InsertUnitRecord(unit);
    }

    private static void OnPlcDataRead(Dictionary<string, object> data)
    {
        try
        {
            var addresses = LocalDbService.Instance.LoadAddressesFromDb();

            // Load process keys từ imported config (nếu có)
            string conveyorHasProductKey = ResolveKeyFromAddresses(addresses, "conveyor_has_product", "has_product", "Conveyor Has Product", "M1050", "Bool");
            string frontOutputCompleteKey = ResolveKeyFromAddresses(addresses, "front_output_complete", "front_complete", "Front Robot Complete", "M1065", "Bool");
            string rearOutputCompleteKey = ResolveKeyFromAddresses(addresses, "rear_output_complete", "rear_complete", "Rear Robot Complete", "M1068", "Bool");
            string frontRobotCountKey = ResolveKeyFromAddresses(addresses, "front_robot_count", "Front Robot Count", "R0", "Int16");
            string rearRobotCountKey = ResolveKeyFromAddresses(addresses, "rear_robot_count", "Rear Robot Count", "R10", "Int16");
            string cycleTimeKey = ResolveKeyFromAddresses(addresses, "cycle_time", "Cycle Time", "cycle_time", "D1022", "Int16");

            // Quality addresses (optional — check if any quality check fails)
            bool hasNg = false;
            foreach (var item in addresses)
            {
                if (!item.Enabled) continue;
                if (item.Group == "Nhóm chất lượng" || item.Group == "Quality")
                {
                    if (item.Alias.Contains("ok", StringComparison.OrdinalIgnoreCase) || 
                        item.Alias.Contains("pass", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }
                    
                    string key = $"{item.Address}:{item.Type}".ToLower();
                    if (TryGetBool(data, key))
                    {
                        hasNg = true;
                        break;
                    }
                }
            }

            // Extract PLC values
            bool conveyorHasProduct = TryGetBool(data, conveyorHasProductKey);
            bool frontOutputComplete = TryGetBool(data, frontOutputCompleteKey);
            bool rearOutputComplete = TryGetBool(data, rearOutputCompleteKey);

            int? frontRobotCount = TryGetInt(data, frontRobotCountKey);
            int? rearRobotCount = TryGetInt(data, rearRobotCountKey);

            double cycleTime = TryGetInt(data, cycleTimeKey) ?? 0;

            string machineId = AppConfig.Current?.MachineId ?? "Unknown";

            UnitTrackingService.Instance.ProcessPLCData(
                conveyorHasProduct,
                frontOutputComplete,
                rearOutputComplete,
                hasNg,       // studNG → hasNg
                hasNg,       // springScrewNG → hasNg (quality fail)
                frontRobotCount,
                rearRobotCount,
                cycleTime,
                machineId
            );
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[UnitTrackingInitializer] Error: {ex.Message}");
        }
    }

    /// <summary>
    /// Tìm key từ danh sách addresses bằng nhiều alias khác nhau.
    /// Thứ tự ưu tiên: (1) key từ imported config, (2) alias từ DB, (3) default address.
    /// </summary>
    private static string ResolveKeyFromAddresses(
        List<DataAddressItem> addresses,
        params string[] aliases)
    {
        // aliases: [key1, key2, ..., defaultAddress, defaultType]
        string defaultAddress = aliases[^2];
        string defaultType = aliases[^1];
        var searchAliases = aliases.Take(aliases.Length - 2).ToList();

        foreach (var alias in searchAliases)
        {
            var addrItem = addresses.FirstOrDefault(x =>
                string.Equals(x.Alias, alias, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(x.Address, alias, StringComparison.OrdinalIgnoreCase));

            if (addrItem != null && !string.IsNullOrWhiteSpace(addrItem.Address))
            {
                return $"{addrItem.Address}:{addrItem.Type}".ToLower();
            }
        }

        return $"{defaultAddress}:{defaultType}".ToLower();
    }

    private static bool TryGetBool(Dictionary<string, object> data, string key)
    {
        return data.TryGetValue(key, out var value) && value is bool b && b;
    }

    private static int? TryGetInt(Dictionary<string, object> data, string key)
    {
        if (data.TryGetValue(key, out var value) && value != null)
        {
            if (value is short s)
                return s;
            if (value is int i)
                return i;
        }
        return null;
    }
}
